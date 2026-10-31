# Spike: atributos, níveis por requisitos, pré-requisitos das fases e versões do curso

## Problema

Numa plataforma de ensino com vários cursos e várias instituições, **só o XP não mede o que importa**. Um curso de astronomia quer saber se o aluno sabe observar e calcular; outro, de meteorologia, se ele sabe comunicar uma previsão. A instituição precisa definir:

- os **atributos** dos alunos (um catálogo dela, de onde cada curso escolhe os seus);
- o que cada **nível** exige: XP total, o mínimo de cada atributo e as fases obrigatórias;
- os **pré-requisitos** de cada fase.

E o curso muda: a instituição publica versões novas (tira uma missão, muda uma recompensa) com alunos no meio do caminho.

As restrições:

- o progresso já gravado (curso + missão) **não pode se perder**;
- o servidor (PHP 8.2 e MySQL 5.7, pronto para PostgreSQL) e o navegador (TypeScript) precisam **chegar ao mesmo nível**, porque o aluno joga offline;
- nada gravado em dobro: XP, atributos e nível são **derivados** das missões concluídas.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Promoção | **Em ordem**: para ser Astrônomo, o aluno cumpre também os requisitos do Observador | É uma escada de carreira: ninguém vira Astrônomo sem cálculo só porque tem XP. A promoção continua nível a nível. |
| Nível | **Sempre derivado** das conclusões, pela escada da versão atual | Nada para reconciliar entre aparelhos. Os pontos nunca diminuem (cada missão vale a sua versão); só uma escada mais dura derruba alguém, e o admin vê quem antes de publicar. |
| Pontos de uma missão | XP e atributos **fixos**, atrás de uma interface `QuestScoring` | A nota proporcional (70% de acerto vale 70% dos pontos) é outra implementação, sem mexer na progressão (Open/Closed). |
| Fase concluída | **Todas as missões** da fase, na versão em que o aluno a faz | O documento não ganha campo novo. Missão opcional pode vir depois. |
| Versão nova do curso | A fase **em andamento** fica na versão em que começou; a fase seguinte começa na **versão atual** | O aluno nunca vê uma fase misturando duas versões, e já entra na fase nova com as melhorias. |
| Missão removida ou alterada | Cada conclusão guarda a **versão** em que valeu; os pontos são os dessa versão | Quem fez continua com os pontos; ninguém mais consegue concluir a missão que saiu. |
| Quem decide a versão | **O servidor**: o aparelho guarda só o id da missão na fila offline | Dois aparelhos com versões diferentes não conseguem misturar a fase: o primeiro que chega fixa a versão dela. |
| Migration | Uma coluna `course_version` nas conclusões de hoje, com as linhas antigas na **versão 1** | Era a única versão quando elas foram gravadas. A chave primária (instituição, aluno, curso, missão) continua sendo a idempotência. |
| Duas linguagens | Regras em **TypeScript e PHP**, provadas pelos **mesmos casos** de conformidade | Um caso novo vale para os dois lados de uma vez; se um lado divergir, o verify falha. |

## Solução

```text
src/
├── Domain/                    TypeScript puro (sem React, sem banco)
│   ├── CourseDocument.ts      o pedaço do documento do curso que a progressão lê
│   ├── QuestScoring.ts        quanto uma missão vale (fixo hoje; Open/Closed)
│   ├── CourseProgress.ts      XP, atributos, fases (bloqueada, aberta, em andamento, concluída), nível e o que falta
│   ├── Institution.ts         catálogo de atributos, total na instituição e quem cairia com uma escada nova
│   └── OfflineSync.ts         a fila offline: o servidor tenta cada missão e decide a versão
├── Content/                   dados fictícios: astro-demo v1, v2 e v3, clima-demo v1 e o catálogo da instituição
└── tests/                     21 testes (os casos + as regras da instituição + as versões + a fila)
cases/                         10 casos de conformidade (documentos, conclusões, tentativas e o resultado esperado)
php/
├── src/Progression.php        o mesmo Domain em PHP 8.2
├── src/ProgressService.php    a sincronização no servidor + a porta CompletionStore e o adapter PDO
└── verify.php                 os mesmos casos + a migration e a sincronização no MySQL e no PostgreSQL
migrations/mysql|pgsql/        000 schema_migrations · 001 as conclusões de hoje · 002 a versão de cada conclusão
```

### O curso de exemplo

| Versão | O que muda |
| :--- | :--- |
| v1 | Fase 1: telescópio (3000 XP, observação 20), órbitas (2000 XP, cálculo 20) e diário (500 XP, observação 5). Fase 2 (exige a 1) e fase 3 (exige a 2). Observador: 4000 XP e cálculo ≥ 30. Astrônomo: 10000 XP, observação ≥ 40 e a fase 2. |
| v2 | A fase 1 perde o diário e ganha o mapa do céu (1000 XP); órbitas passa a valer 2500 XP e cálculo 25; cometas, 3500 XP. |
| v3 | Só a escada endurece: o Observador passa a exigir cálculo ≥ 35. |

### Os três cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Nível exige atributo | Com 5000 XP e cálculo 20, o aluno continua Aprendiz, e o "falta" mostra **10 de cálculo** (caso 001). |
| Fase com pré-requisito | Sem a fase 1, a fase 2 aparece **bloqueada, com o motivo** (`missingPhases: ["fase-1"]`), e a missão dela é recusada com `PHASE_LOCKED` (caso 002). |
| Versão nova no meio da fase | No meio da fase 1 da v1, sai a v2. O mapa do céu (só da v2) é recusado, o diário (só da v1) é aceito na v1 e fecha a fase, e a missão da fase 2 já vale na v2: **9000 XP**, com as órbitas valendo os 2000 XP da v1 (caso 003). |

### Os códigos de recusa

`ALREADY_COMPLETED` · `QUEST_UNKNOWN` (não existe na versão atual nem numa fase começada) · `PHASE_LOCKED` · `PHASE_CONCLUDED` · `QUEST_NOT_IN_PHASE_VERSION` (existe na versão atual, mas a fase está em outra versão).

## Como testar

```bash
yarn install --frozen-lockfile
yarn verify   # ESLint + tsc + 21 testes + php php/verify.php (sem banco, só as regras)
```

Com os bancos, como no CI (PHP 8.2 com `pdo_mysql` e `pdo_pgsql`):

```bash
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
docker run -d --rm --name spike-pg -e POSTGRES_DB=spike -e POSTGRES_USER=spike \
  -e POSTGRES_PASSWORD=spikepw -p 127.0.0.1:15432:5432 postgres:16
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
export SPIKE_PGSQL_HOST=127.0.0.1 SPIKE_PGSQL_PORT=15432 SPIKE_PGSQL_DB=spike \
  SPIKE_PGSQL_USER=spike SPIKE_PGSQL_PASS=spikepw
php php/verify.php
docker stop spike-mysql spike-pg
```

## Resultado

- **21 testes TypeScript** e **17 checks de regra em PHP**, com os 10 casos de conformidade dando o mesmo resultado nos dois lados.
- **8 checks por banco**, conferidos no MySQL 5.7.44, no MySQL 8.4 e no PostgreSQL 16:
  - a migration roda duas vezes sem erro, sem mudar nenhuma linha de hoje, e as linhas antigas ficam na versão 1;
  - a sincronização grava a versão decidida pelo servidor, e lida de volta do banco dá o mesmo progresso do caso 003;
  - a mesma fila enviada de novo não grava nada, e uma instituição não vê as conclusões da outra.
- **Aprendizado do MySQL 5.7**: ele não tem `ADD COLUMN IF NOT EXISTS`. A coluna nova sai por `information_schema` + `PREPARE`, e o ramo "já existe" precisa ser `DO 0`. Um `SELECT 1` deixa um resultado sem ler, e o PDO trava a instrução seguinte (erro 2014).

## Limites conhecidos

- Uma fase concluída fica fechada na sua versão: uma missão nova que a v2 acrescente nela não aparece para quem já a terminou.
- Se uma versão nova tirar uma fase que o aluno está fazendo, ele a termina na versão dele (ela continua no Portal).
