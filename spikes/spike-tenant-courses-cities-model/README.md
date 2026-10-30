# Spike: sede, cursos com cidade e fases, e o vínculo com o curso-modelo

## Problema

Uma plataforma de ensino em 3D para várias instituições (multi-tenant) precisa deixar cada instituição montar a própria estrutura, **sem depender de uma versão nova do sistema**:

- a **sede**, uma cidade 3D com os prédios da instituição;
- os **cursos**, cada um com a sua cidade (a comunidade dos alunos daquele curso);
- as **fases** do curso: cada fase é uma cidade, com missões e pré-requisitos de outras fases.

As restrições:

- hospedagem compartilhada com **PHP 8.2 e MySQL 5.7**, sem custo, pronta para trocar para PostgreSQL;
- uma instituição **nunca vê** a estrutura da outra;
- a plataforma oferece um **curso-modelo**, e a instituição pode usá-lo com ajustes sem perder as correções que a plataforma lançar;
- o **progresso já gravado** dos alunos (curso + missão) não pode se perder quando a trilha de hoje virar um curso.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Onde fica a estrutura | **Documento JSON versionado** no banco: cada publicação é uma versão nova e imutável | O admin edita e publica sem release; a versão anterior continua lá (e o aluno pode terminar a fase nela). |
| Tamanho do documento | **Um documento por curso** (cidade do curso e todas as fases); a sede é outro | A versão do curso é um número só: a migração ao fim da fase e a mescla do vínculo ficam simples. Um curso de 20 fases tem ~29 KB. |
| Prédios obrigatórios | Por tipo de cidade, pelo **papel** do prédio (a posição é livre) | Sede: Matrículas, Institucional, Secretaria e Portal dos cursos. Cidade do curso: Portal das fases e Mural. Fase: nenhum. |
| Erros | **Código estável + caminho** em JSON Pointer (às vezes um parâmetro), nunca um texto pronto | A mesma lista serve à API, ao editor do admin e aos casos de conformidade do validador TypeScript. |
| Curso-modelo | Fica no **repositório** (`platform/courses/<id>/v<N>.json`), um arquivo por versão | Validado no CI, compartilhado por todas as instituições, e a versão antiga continua disponível. |
| Vínculo | A instituição guarda só uma **camada**: acrescenta prédios, NPCs e missões e ajusta cor, posição e tamanho do que **não está travado** | Open/Closed: a plataforma lança uma versão nova e a camada continua valendo, porque aponta para ids. |
| Versão nova que quebra a camada | A instituição **segura a versão anterior**, e a nova fica pendente, com os problemas para o admin | O aluno nunca recebe uma cidade inválida. Assim que a camada é corrigida, a versão nova é adotada. |
| Cópia | Copia o curso como o aluno o vê, **sem as travas** e com id próprio | Para mudar o que está travado (o XP de uma missão do modelo, por exemplo). A cópia não recebe mais as versões da plataforma. |
| Trilha de hoje | Vira o curso-modelo com **o mesmo id**, e a cidade de hoje vira a fase 1 | O progresso guarda curso + missão: com o mesmo id e as mesmas missões, nenhuma linha do banco muda. |

## Solução

```text
platform/
├── headquarters/v1.json          a sede padrão (de quem ainda não publicou a sua)
└── courses/campus-demo/v1, v2    o curso-modelo de exemplo (fictício), uma versão por arquivo
legacy/campus-demo/               a mesma trilha no formato de hoje (5 arquivos + textos), para provar a migração
migrations/
├── mysql/001..002   tenants · course_documents, course_document_versions, course_links
└── pgsql/001..003   o mesmo + 003: Row Level Security nas três tabelas
src/
├── Content/                      regras puras, sem banco
│   ├── DocumentValidator.php     sede e curso: cidades, prédios obrigatórios, fases, níveis, atributos, textos
│   ├── Overlay.php               a camada do vínculo: add/set por id, itens travados, campos permitidos
│   ├── LegacyTrackMigration.php  trilha de hoje ➔ curso-modelo com 1 fase, mantendo o id e as missões
│   ├── Problem.php · CourseId.php · Json.php (forma canônica: o hash e o ETag)
├── Courses/
│   ├── CourseService.php         o que o aluno vê; publicar, vincular, copiar e adotar versões
│   ├── DocumentRepository.php    a porta (interface) · PdoDocumentRepository.php, o adapter
│   └── PlatformCatalog.php       o curso-modelo e a sede padrão, versionados no repositório
├── Tenant/TenantScopedRepository.php   recusa SQL sem "tenant_id = :tenant_id"
└── Http/CoursesApi.php           as rotas, no envelope {status, data|error} do contrato
cases/                            52 casos de conformidade (documento + mutações + problemas esperados)
http/api/courses.php              controller fino (no labs responde 403)
```

### O documento do curso

```text
{ schema, kind: "course", courseId, titleKey,
  attributes: ["logica", ...],                       os atributos do catálogo da instituição que o curso usa
  levels: [{ id, labelKey, minXp, minAttributes?, requiredPhases? }],
  city:   { halfSize, spawn, buildings: [{ id, role?, labelKey, position, size, color, locked? }], npcs?, interiors? },
  phases: [{ id, titleKey, requires: [ids de fases], city: {...}, quests: [{ id, buildingId, titleKey, rewardXp, attributes? }] }],
  texts:  { "pt-BR": {...}, "en-US": {...} } }
```

Este spike valida só a **forma e as referências** da progressão (atributos, níveis e pré-requisitos existem; as fases não formam ciclo). Quem sobe de nível e quando uma fase abre é da próxima demanda.

### A camada do vínculo

```text
{ schema, kind: "overlay", courseId: "campus-demo",
  city:   { add: { buildings, npcs, interiors }, set: { buildings: { "<id>": { color, position, ... } } } },
  phases: { "fase-1": { add: { buildings, npcs, interiors, quests, stations: { "<prédio>": [...] } }, set: {...} } },
  texts:  { "pt-BR": {...}, "en-US": {...} } }
```

A mescla passa pelo **mesmo validador** de um curso. Os problemas voltam em duas listas:

- `problems`, em caminhos da **camada**: item travado, campo que não pode mudar, alvo que não existe;
- `mergedProblems`, em caminhos do **curso mesclado**: um prédio novo em cima de outro, um id repetido, um segundo Portal.

### API (no envelope do contrato)

| Rota | Resposta |
| :--- | :--- |
| `GET headquarters` | A sede (da instituição ou a padrão), com `ETag` e `Cache-Control: private, no-cache`; `304` com o mesmo ETag. |
| `GET courses` | Os cursos visíveis: vinculados (com a versão adotada e a pendente) e os da instituição. |
| `GET course?courseId=` | O curso inteiro (cidade e fases), com `ETag`; `404 COURSE_NOT_FOUND` para o curso de outra instituição. |
| `POST publish` | `{kind, slug, content}` (sede, curso ou camada). `201` versão nova, `200` conteúdo igual, `422` com os problemas, `403` para aluno. |
| `POST link` / `POST copy` | Vincula um curso da plataforma / copia um vinculado para um curso da instituição. |

## O que o `verify` prova (102 checks)

**Sem banco:**

- **Migração (Gherkin: progresso preservado):** o `v1.json` do repositório é exatamente o que a migração gera. O id do curso é o da trilha, as missões têm o mesmo id e o mesmo XP, e um aluno com 2 missões continua com 250 XP.
- **52 casos de conformidade:** sede, curso, papéis, fases (pré-requisito inexistente, ela mesma, ciclo), missão repetida entre fases, níveis com atributos e fases, textos, salas e a camada. Cada caso dá **exatamente** os problemas esperados.
- **Mescla:** a cantina da instituição vale na versão 1 e colide com o Observatório da versão 2. Sem camada, o curso vinculado é exatamente o curso-modelo.

**Em cada banco (MySQL e PostgreSQL reais):**

- **Gherkin: sede e cidade do curso.** Antes de publicar a sua, a instituição já tem a sede padrão. Pelo Portal dos cursos o aluno vê o curso vinculado, e pelo Portal das fases chega à fase 1.
- **Gherkin: isolamento.** O curso da Aurora pedido pela Boreal é "não encontrado". O curso-modelo sem vínculo também.
- **Gherkin: estrutura inválida.** Uma sede sem Matrículas e uma missão com prédio inexistente são recusadas com código e caminho, e nada recusado vira versão. Aluno não publica. Republicar o mesmo conteúdo com outra formatação não cria versão.
- **Vínculo:**
  - a camada aparece para o aluno e muda o ETag;
  - mudar uma missão travada é recusado;
  - a versão 2 que colide fica pendente, com os problemas, e o aluno continua na 1;
  - corrigida a camada, a 2 é adotada na hora;
  - quem vincula depois já entra na 2.
- **Cópia:** id próprio, origem registrada, sem travas. Na cópia o XP muda; no vinculado, não.
- **Repository:** um SQL sem o filtro de tenant não chega ao banco, e quem chama não troca o tenant da sessão.
- **PostgreSQL com papel comum:**
  - sem tenant, nada é visível;
  - com a Boreal, até um `SELECT` sem `WHERE` só vê a Boreal;
  - gravar para a Aurora é recusado;
  - publicar funciona com o RLS ligado.
- **Paralelo:** 2 processos × 10 publicações do mesmo curso dão as versões 1 a 20, sem repetir nem pular (`SELECT … FOR UPDATE`).

**HTTP de verdade (`php -S`):** 401 sem sessão; ETag com `304`; 404 entre instituições; 422 com `{code, path, param}` e com `mergedProblems`; 403 para aluno; 404 para curso inexistente; 405.

## Achados

1. **`{}` e `[]` se confundem no PHP.** Decodificado como array, um objeto vazio vira lista vazia. A forma canônica (`Json::encodeArray`) devolve `{}` nas chaves que são sempre mapas (textos e `minAttributes`); sem isso, o hash de um curso mesclado mudaria a cada leitura.
2. **`SELECT … FOR UPDATE` no PostgreSQL exige `UPDATE`.** O papel comum da aplicação precisa do `GRANT UPDATE` em `course_documents`, mesmo sem nunca alterar uma linha.
3. **Os problemas da mescla apontam para o curso mesclado.** Um prédio acrescentado pela camada aparece depois dos da plataforma (`/phases/0/city/buildings/3`). O editor do admin precisa mostrar o curso mesclado, ou traduzir o caminho de volta para a camada.
4. **Missão nova num prédio da plataforma precisa de estação.** A sala do prédio já existe no modelo, então a camada acrescenta a estação em `add.stations`. Para um prédio novo, a sala inteira vai em `add.interiors`.
5. **A mescla roda a cada leitura:** 0,3 ms no exemplo e 2,9 ms num curso de 20 fases (mescla, validação e hash). Não precisa de cache agora. Se precisar, a chave é a versão adotada + a versão da camada.
6. **A adoção de versões novas não roda no pedido do aluno.** O `refreshLinks` roda na release (ou num Cron da hospedagem), e também quando o admin publica uma camada.

## Demo

Sem demo ao vivo, de propósito: publicar estrutura exige o admin de uma instituição, e uma rota de escrita pública no servidor do labs seria alvo de abuso. O endpoint em `http/api/` e o código respondem **403** no servidor (o deploy do labs confere). A prova é a execução do `verify`, publicada na página deste item.

## Como testar localmente

Precisa de **PHP 8.2** com `pdo_mysql` e `pdo_pgsql` e de Docker para os bancos (os comandos estão em "Como rodar", na página do item). Sem banco configurado, o `verify` roda só as regras puras.

```bash
php scripts/verify.php
php scripts/migrate-legacy.php campus-demo   # imprime o curso-modelo gerado da trilha de hoje
```

Dados 100% fictícios (Escola Aurora, Instituto Boreal, campus de demonstração).
