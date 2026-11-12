# Spike: medalhas e certificado verificável, a custo zero

## Problema

Numa plataforma de ensino com cidades 3D, o aluno quer mostrar o que conquistou: medalhas ao concluir fases e marcos de atributos, e um certificado ao concluir um curso. O certificado só vale se quem o recebe (um empregador, outra escola) consegue conferir.

Restrições:
- **Custo zero:** a hospedagem compartilhada já paga (PHP 8.2 e MySQL), sem serviço de emissão nem chave privada guardada no servidor.
- **LGPD:** a página pública mostra só o necessário; nada de e-mail, notas ou atributos.
- **Ninguém adivinha** o endereço do certificado de outra pessoa.
- **A mesma regra nos dois lados:** a tela mostra as medalhas sem perguntar ao servidor, e o servidor emite o certificado com a mesma regra de "curso concluído".

## Decisões (do Pablo, 2026-11-11)

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Medalhas | Declaradas no **documento do curso**: o id, a chave do nome, um ícone de uma lista fixa e o critério (`phase`, `attribute` com `min`, ou `course`). Até 30 por curso. | Cada instituição cria as do curso dela; o validador confere que a fase e o atributo existem. A instituição não envia imagem. |
| Curso concluído | **Todas as fases concluídas.** | Simples de explicar e de conferir no servidor, que emite sozinho. |
| Regra | A mesma em TypeScript (`src/badges.ts`) e em PHP (`php/Badges/BadgeRules.php`), com os casos de `cases/` rodando nos dois. | A tela e o servidor nunca discordam. |
| O que o certificado mostra | O **nome de exibição**, o curso, a instituição, a data de conclusão e o código. Sem e-mail, notas nem atributos. | Sem o nome, o certificado não prova nada a quem recebe. |
| Código | 20 caracteres do alfabeto de Crockford (sem I, L, O e U), **100 bits aleatórios**, em grupos de 5. | Ninguém adivinha o endereço; o código cabe numa linha impressa. |
| Formato | Uma **página pública** de verificação (que imprime em PDF pelo navegador) e o mesmo certificado em **Open Badges 2.0 "hosted"** (JSON-LD): a Assertion leva à BadgeClass e ao Profile da instituição. | Os leitores de badges entendem; sem assinatura, nenhuma chave fica na hospedagem. O Open Badges 3.0 assinado ficou de fora por isso. |
| Quem recebeu | No JSON, só o **hash do e-mail com sal** (o padrão pede um identificador). | Quem já sabe o e-mail confere; quem não sabe não descobre. |
| Buscadores | A página e o JSON vão com `noindex`. | O nome do aluno não aparece numa busca. |
| Foto do momento | O certificado guarda o nome, o curso e a instituição da hora da emissão. Pedir de novo devolve o mesmo (um por aluno e curso). | É um documento: não muda depois. |

## Solução

```text
src/badges.ts                     as regras em TypeScript (as medalhas ganhas, o curso concluído, os problemas)
src/badges.test.ts                os casos de cases/ no Node 24 (que roda TypeScript sem dependência)
cases/                            os casos que os dois lados rodam
php/Badges/BadgeRules.php         as mesmas regras em PHP
php/Badges/CertificateCode.php    o código: gerar, normalizar o que foi digitado e mostrar em grupos
php/Badges/CertificateStore.php   a tabela: emitir (um por aluno e curso) e achar pelo código
php/Badges/OpenBadges.php         a Assertion, a BadgeClass e o Profile do Open Badges 2.0
php/Badges/DemoCourse.php         o curso fictício da demo, como o documento do curso declararia
php/Badges/DemoSession.php        a entrada e o progresso da demo, no lugar do login e do progresso do produto
public/course.php                 o progresso, as medalhas e a emissão (só com o curso concluído)
public/verify.php                 a página pública de verificação
public/ob.php                     o Open Badges 2.0 (Assertion, BadgeClass e Profile)
public/index.html                 a demo
scripts/verify.php                as regras, a emissão no MySQL e os endpoints de verdade
migrations/mysql/                 a tabela spike_certificates
```

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Medalha por fase | Concluída a fase 1, a medalha "Primeira fase" aparece (na tela e pela regra do servidor). |
| Certificado verificável | Com todas as fases concluídas, o certificado sai. A página pública mostra o nome, o curso, a instituição e a data, sem o e-mail; um código que não existe dá 404. |

## Como testar

```bash
node --no-warnings --test src/badges.test.ts   # as regras em TypeScript (Node 24)
php scripts/verify.php                            # as mesmas regras em PHP, sem banco

# com o MySQL 5.7 (o da hospedagem) e o 8.4 (o do CI)
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
yarn verify   # PHP 8.2 com pdo_mysql e curl
docker stop spike-mysql
```

## Resultado

- **7 casos no TypeScript e 27 verificações no PHP**, verdes no MySQL 5.7.44 e no 8.4.13:
  - 7 casos das regras, os mesmos nos dois lados;
  - 5 do código e do Open Badges, sem banco;
  - 3 da emissão no banco;
  - 12 dos endpoints de verdade.
- **Nenhuma dependência nova:** PHP e MySQL da hospedagem; o Node 24 do CI roda o TypeScript sem compilar.

## Limites e próximos passos

- **No produto (US45):**
  - as medalhas ficam no JSON do curso, conferidas pelo validador nos dois lados, e o editor do curso no admin ganha uma aba;
  - a Secretaria do aluno mostra as medalhas e os certificados;
  - o certificado é emitido pelo servidor a partir do progresso que ele já guarda (US31 e US43), na tabela do banco da instituição.
- **Ainda fora:** revogar um certificado (o Open Badges 2.0 tem `revoked`), o certificado de uma trilha (vários cursos) e o Open Badges 3.0 assinado.
- **Limpeza da demo:** os certificados fictícios somem em 1 dia.
