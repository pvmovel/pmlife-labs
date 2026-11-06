# Spike: turmas com limite em múltiplos de 4

## Problema

Numa plataforma de ensino com várias instituições, os alunos de um curso estudam em **turmas**. Elas precisam de um **tamanho máximo** por dois motivos:
- o servidor (uma hospedagem compartilhada, sem custo) aguenta poucos alunos online ao mesmo tempo;
- as tarefas, as fases, as provas e os trabalhos futuros vão ser feitos em **grupos de 2 ou de 4 alunos**, então a turma tem de fechar em múltiplos de 4.

Quando uma turma lota, ou passa a data de fim, a próxima matrícula precisa de uma turma nova, sem o admin intervir. As turmas que já existem têm alunos acima de qualquer limite, e ninguém pode ser tirado delas. Duas matrículas ao mesmo tempo na última vaga não podem passar do limite. Tudo em PHP 8.2 e MySQL 5.7, pronto para PostgreSQL.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Tamanho | **Múltiplos de 4**, de 4 a 48, com o padrão **12** | Forma grupos de 2 e de 4. O 48 fica longe do que a hospedagem aguenta online, e o padrão sobe só depois de medido. |
| Dois níveis | O master da plataforma define o **teto** de cada instituição; a instituição escolhe o limite de cada curso **até o teto** | A plataforma protege o servidor, e a instituição decide dentro disso. O próprio teto segue a mesma regra. |
| Teto que baixa | O limite que vale numa turma é o dela, **nunca acima do teto atual** | Baixar o teto vale na hora, sem reescrever as turmas. |
| Fechamento | A turma fecha **por lotação ou por data**, o que vier primeiro | Serve a turma de semestre (com datas) e a turma contínua (sem fim). |
| Turma seguinte | Sem turma aberta, a matrícula **abre a seguinte** (`turma-2`, `turma-3` …) com o limite do curso, começando na hora e sem fim | Ninguém fica sem turma, e o admin não precisa intervir. O nome pula os que já existem. |
| Qual turma | Entre as abertas, **a que começou por último** (no empate, a mais antiga) | É a regra da US44: a turma do semestre atual vem antes da antiga. |
| Turmas de antes | Ganham o limite padrão, mas **ninguém sai delas**: a cheia só para de receber | Mudar a turma de quem já estuda junto seria pior que uma turma grande. |
| Equipe | O master entra com **matrícula de equipe**: sem turma e sem ocupar vaga | Ele testa e dá suporte sem tirar a vaga de um aluno, e fica fora dos totais. |
| Concorrência | A matrícula é uma transação que **trava a linha do curso** (`SELECT … FOR UPDATE`), em `READ COMMITTED` | A segunda matrícula espera a primeira e já vê a vaga ocupada. Primeiro a trava, depois a criação da linha, se faltar: no MySQL, um `INSERT IGNORE` numa linha que já existe pega uma trava compartilhada, e dois pedidos assim fariam um deadlock. |
| Duas linguagens | A regra é pura e espelhada em **TypeScript** (o admin e o seletor) e em **PHP** (o servidor), com os **mesmos casos de conformidade** | Uma regra, dois lados, como os validadores de documento do produto. |
| MySQL 5.7 | Sem `CHECK` (o 5.7 ignora) e sem `ADD COLUMN IF NOT EXISTS`. A migration é idempotente e tem `DEFAULT` para o código anterior | Roda no phpMyAdmin antes do deploy, quantas vezes for preciso. No PostgreSQL, o `CHECK` entra como segunda defesa. |

## Solução

```text
cases/                      os casos de conformidade (limite, seletor e escolha da turma), os mesmos nos dois lados
src/Domain/CohortCapacity.ts            a regra pura em TypeScript
src/tests/                              os casos no vitest e os testes do Domain
php/src/CohortCapacity.php              o espelho em PHP
php/src/CohortEnrollment.php            a matrícula com a trava, o teto, o limite do curso e a equipe
php/worker.php                          uma matrícula num processo próprio (a corrida da última vaga)
php/verify.php                          os casos e os cenários em cada banco
migrations/mysql|pgsql/
├── 000..001   o controle e o estado de antes (instituição, turmas por período e matrícula, como na US44)
└── 002        o teto, o limite da turma, a matrícula de equipe e a linha do curso (o limite e a trava)
```

As tabelas têm o prefixo `cc_` e são apagadas no fim do verify, porque os spikes do CI dividem o mesmo banco.

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Turma lotada abre a seguinte | 12 alunos na `turma-1` (limite 12); o 13º abre a `turma-2`, com o mesmo limite. |
| Só múltiplos de 4 | 10 é recusado (`COHORT_LIMIT_INVALID`); o seletor oferece 4, 8, 12 … até o teto. |
| Teto da plataforma | Com o teto de 16, a instituição não usa 20 por turma (`COHORT_LIMIT_ABOVE_CEILING`). |
| Duas matrículas na última vaga | Com 11 de 12, dois processos se matriculam ao mesmo tempo: um fica com a vaga, e o outro vai para a `turma-2`. Sem a trava, os dois entram e a turma fica com 13. |
| Turmas de hoje | A `padrao` com 30 alunos ganha o limite 12; os 30 ficam, e a próxima matrícula vai para a `turma-2`. |

## Como testar

```bash
yarn install --frozen-lockfile
yarn verify   # ESLint + tsc + vitest + php php/verify.php (os casos, sem banco)

# com os bancos, como no CI
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
docker run -d --rm --name spike-pg -e POSTGRES_DB=spike -e POSTGRES_USER=spike \
  -e POSTGRES_PASSWORD=spikepw -p 127.0.0.1:15432:5432 postgres:16
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
export SPIKE_PGSQL_HOST=127.0.0.1 SPIKE_PGSQL_PORT=15432 SPIKE_PGSQL_DB=spike \
  SPIKE_PGSQL_USER=spike SPIKE_PGSQL_PASS=spikepw
php php/verify.php   # PHP 8.2 com pdo_mysql e pdo_pgsql
docker stop spike-mysql spike-pg
```

## Resultado

- **Front:** 19 testes no vitest, com os 12 casos de conformidade.
- **PHP:** os mesmos 12 casos e os cenários em cada banco: 45 checks no MySQL 5.7 com o PostgreSQL 16, e 29 no MySQL 8.4, que é o do CI. Tudo verde em 3 rodadas seguidas.
- **A corrida da última vaga:** com a trava, as duas matrículas levaram 1,7 s, com 0,4 s de pausa em cada: a segunda esperou a primeira. Sem a trava, as duas entraram, e a turma ficou com 13 alunos para 12 vagas.

## Veredito

A regra cabe no desenho da US44 sem banco novo:
- **Migration:** uma idempotente (o teto, o limite da turma, a marca de equipe e a linha do curso), com `DEFAULT` para o código anterior.
- **Trava:** na linha do curso, a escolha da turma passa a ser segura sob concorrência.
- **Produto (US48):** a regra pura vai para o Domain (TypeScript e PHP, com os casos de conformidade), a matrícula da US44 passa a usar a transação com a trava, e o admin ganha o teto (plataforma) e o limite por curso (instituição), com os seletores em múltiplos de 4.

Dados 100% fictícios.
