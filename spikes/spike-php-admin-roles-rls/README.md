# Spike: autorização do admin por papel × instituição (MySQL e PostgreSQL com RLS)

## Problema

Uma plataforma de ensino com várias instituições precisa de um painel de administração em que cada pessoa veja e faça **só o que o papel dela permite, só onde ela pode**:

- o **master da plataforma** cria e desativa instituições, cria o master de cada uma e age em qualquer instituição;
- o **master da instituição** administra só a dele (pessoas, matrículas, cursos, papéis);
- o **autor** edita só os cursos em que foi designado, e o **tutor** só acompanha;
- o **aluno** não entra.

A tela esconde o que não cabe a cada papel (a [PoC do layout](../../pocs/poc-admin-multitenant-panel) usa a mesma regra), mas quem recusa de verdade é o servidor. Um pedido direto à API pelos dados de outra instituição tem de ser recusado. Tudo em PHP 8.2 e MySQL 5.7 numa hospedagem compartilhada, sem custo, e pronto para o PostgreSQL com Row Level Security.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| A regra | Uma tabela só, `AdminPolicy::can(ator, ação, instituição, curso)`, pura e sem banco | É a mesma da PoC: a tela e o servidor nunca discordam. Toda rota passa por ela. |
| Papéis por contexto | Plataforma (`platform_admins`), instituição (`memberships.role`: aluno, master ou tutor) e curso (`course_staff`: autor ou tutor) | Como os contextos do Moodle: a mesma pessoa pode ser autora de um curso e aluna de outro, sem papel composto em texto. |
| Master da plataforma | Uma linha em `platform_admins`, **fora** do escopo de instituição. O primeiro entra por um SQL versionado (`ops/first_platform_admin.sql`, no phpMyAdmin); os seguintes, pelo próprio admin | Sem senha nem chave no código, e sem tela de "primeiro acesso" exposta. A recuperação é o "Esqueci a senha" de sempre. |
| Master de uma instituição nova | O e-mail com conta ganha o vínculo de master; sem conta, a conta nasce com uma senha que ninguém conhece (Argon2id) e a pessoa define a dela pelo "Esqueci a senha" | Nenhum fluxo nem token novo: reaproveita o código por e-mail que já existe. Uma conta por e-mail, com vínculos em várias instituições. |
| Papéis lidos a cada pedido | O `ActorResolver` relê os papéis do banco; vínculo ou instituição desativados não dão papel | Tirar um papel vale no pedido seguinte, sem esperar a sessão acabar. |
| Instituição no pedido | `?tenant=` só vale para o master da plataforma. Para os outros, outra instituição é **403 `TENANT_FORBIDDEN`**, antes do banco | A instituição vem da sessão. Mesmo assim, todo SQL é filtrado (a trava do repositório) e, no PostgreSQL, o RLS barra. |
| Repositório da plataforma | Só o `PlatformRepository` alcança todas as instituições, e só nasce para o master da plataforma | O resto do código usa o repositório com escopo e não tem como esquecer o filtro. |
| RLS no PostgreSQL | **Dois usuários de banco**: membro de `app_tenant` (vê só a instituição de `app.tenant_id`) e membro de `app_platform` (vê todas), usado só pelo repositório da plataforma | Uma variável de sessão nunca libera tudo: alcançar todas as instituições exige a outra conexão. |
| Auditoria | `admin_audit`: quem, o quê, quando, onde e em quem. Só cresce (no PostgreSQL, sem `UPDATE` nem `DELETE` para os dois papéis) | A ação da plataforma aparece para a instituição como "equipe da plataforma", sem o nome; a ação só da plataforma (outro master) nenhuma instituição vê. O alvo é o nome, nunca o e-mail. |
| Sessão de admin | 30 min sem uso ou 4 h desde a senha (o jogo: 2 h e 12 h). Vencida, **401 `ADMIN_REAUTH`**, e o jogo continua | A mesma sessão, com marcadores próprios do admin. |
| Desativar | Instituição e vínculo ganham `active`; nada é apagado | O progresso e as matrículas ficam guardados, e dá para reativar. |

## Solução

```text
migrations/mysql|pgsql/
├── 000, 001   schema_migrations · o banco de hoje (instituições, contas, vínculos, matrículas)
├── 002        active na instituição e no vínculo · platform_admins · course_staff · admin_audit
└── 003        (só PostgreSQL) app_tenant e app_platform, privilégios e Row Level Security
ops/first_platform_admin.sql                 o primeiro master da plataforma (phpMyAdmin)
src/
├── Access/
│   ├── AdminPolicy.php · AdminActor.php     a regra (papel × instituição × curso) e quem pede
│   ├── AdminSession.php                     o prazo menor da sessão de admin
│   └── ActorResolver.php                    a sessão ➔ os papéis lidos do banco
├── Admin/
│   ├── TenantAdminService.php               pessoas, papéis de curso e auditoria de uma instituição
│   ├── TenantAdminRepository.php            o adapter, com o escopo de instituição
│   └── InstitutionRules.php · AdminRejected.php
├── Platform/
│   ├── PlatformService.php                  instituições, outros masters e a escolha da instituição
│   └── PlatformRepository.php               o único que alcança todas as instituições
├── Http/AdminApi.php                        as rotas, no envelope {status, data|error}
└── Tenant/ · Db/                            o escopo de instituição e as migrations (dos spikes anteriores)
http/api/admin.php                           controller fino (no labs responde 403)
```

### A API

| Rota | Quem | Resposta |
| :--- | :--- | :--- |
| `GET me` | quem tem papel de admin | plataforma, instituição, papéis e as seções da navegação |
| `GET institutions?q=&page=` | plataforma | a lista, com busca e páginas de 20 |
| `POST institutions {name, slug, masterEmail}` | plataforma | `201` · `409 SLUG_TAKEN` · `422 INVALID_INSTITUTION` com o erro de cada campo |
| `POST institution-status {slug, active}` | plataforma | desativa ou reativa |
| `POST platform-admins {email}` | plataforma | outro master da plataforma |
| `GET members?tenant=&course=` | master, tutor; tutor do curso com `course` | as pessoas (com curso, só os alunos dele) |
| `POST member-status {tenant?, userId, active}` | master | desativa ou reativa um vínculo |
| `POST staff {tenant?, courseId, userId, role}` | master | autor ou tutor de um curso (`role` null tira) |
| `GET audit?tenant=` | master | a auditoria da instituição |

Antes de tudo: sem sessão, `401`; sessão de admin vencida, `401 ADMIN_REAUTH`; `POST` sem CSRF, `403 CSRF_INVALID`; aluno, `403 FORBIDDEN`.

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Master da plataforma cria uma instituição | A "Aurora Norte" aparece na lista, e o master dela entra no admin dela (depois de definir a senha). A auditoria da Aurora Norte registra a criação e o acesso. |
| Master da instituição só vê a própria | A lista de pessoas só tem a Aurora. `?tenant=boreal-demo` dá `403 TENANT_FORBIDDEN`; desativar alguém da Boreal pelo id dá `404`, porque para a Aurora a pessoa não existe. |
| Aluno não acessa o admin | Qualquer rota do admin dá `403 FORBIDDEN`. |

## Como testar

```bash
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
docker run -d --rm --name spike-pg -e POSTGRES_DB=spike -e POSTGRES_USER=spike \
  -e POSTGRES_PASSWORD=spikepw -p 127.0.0.1:15432:5432 postgres:16
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
export SPIKE_PGSQL_HOST=127.0.0.1 SPIKE_PGSQL_PORT=15432 SPIKE_PGSQL_DB=spike \
  SPIKE_PGSQL_USER=spike SPIKE_PGSQL_PASS=spikepw
php scripts/verify.php   # PHP 8.2 com pdo_mysql e pdo_pgsql (sem banco, só as regras)
docker stop spike-mysql spike-pg
```

## Resultado

- **108 checks**: 10 de regra pura, 45 no MySQL (5.7.44 e 8.4) e 53 no PostgreSQL 16 (os mesmos 45 mais 8 do RLS).
- No PostgreSQL, a API inteira roda pelos **dois usuários de banco** (nenhum é superusuário nem tem `BYPASSRLS`). Com a Aurora informada, um `SELECT` sem `WHERE` vê só as 7 pessoas da Aurora, e um `UPDATE` de alguém da Boreal não alcança a linha.
- **Teste de mutação:** cada trava tirada de propósito derruba checks. Aceitar o `?tenant=` de qualquer um derruba 12; abrir a política de vínculos para `app_tenant` derruba 4; ignorar o vínculo desativado derruba 5.
- As migrations rodam de novo sem erro (como no phpMyAdmin), e o `verify` deixa o banco limpo, sem tabela nem papel do spike.

## Limites conhecidos

- **No MySQL**, a auditoria "só cresce" por disciplina do código (nenhum método altera ou apaga): na hospedagem compartilhada, um trigger pode exigir o privilégio `SUPER`, e o privilégio por tabela não está no cPanel. No PostgreSQL, os privilégios garantem.
- **No PostgreSQL**, com `FORCE ROW LEVEL SECURITY`, o dono das tabelas que não é superusuário também fica sem ver nada. O SQL do primeiro master roda com o administrador do banco ou com o usuário da plataforma.
- A busca de instituições ignora maiúsculas nos dois bancos, mas os acentos só no MySQL (a collation). No PostgreSQL, seria a extensão `unaccent`.
- O CSRF e o limite de tentativas do login são os da US30; aqui o CSRF chega pronto (`csrfOk`).
