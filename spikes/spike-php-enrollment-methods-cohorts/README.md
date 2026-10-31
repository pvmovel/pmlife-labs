# Spike: matrícula por curso (livre, código ou aprovação) e turmas

## Problema

Numa plataforma de ensino com várias instituições, **cada instituição decide, curso a curso, como o aluno entra**:

- **livre:** qualquer aluno da instituição se matricula na hora;
- **por código de convite:** só quem tem o código. O código não pode vazar, e não pode ser adivinhado por tentativa;
- **com aprovação:** o aluno pede, e o admin da instituição aprova ou recusa.

Os alunos de um curso se agrupam em **turmas** por período (a turma decide quem estuda junto). O progresso tem de respeitar a matrícula, e quem já estudava antes de a matrícula existir **não pode perder nada**. Tudo em PHP 8.2 e MySQL 5.7 numa hospedagem compartilhada, sem custo e pronto para PostgreSQL.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Métodos | Cada método é uma **estratégia** (`EnrollmentMethod`): livre, código e aprovação | Um método novo é outra classe, sem mexer no serviço (Open/Closed), como as *enrolment methods* do Moodle. Pagamento fica de fora (custo zero). |
| Onde fica a regra | Numa **tabela própria** (`course_enrollment_rules`); sem linha, matrícula livre | O código de convite não pode ir no documento do curso, que o aluno lê inteiro. Mudar o método não cria uma versão nova do curso. |
| Código de convite | Só o **HMAC-SHA256** com o sal do servidor; comparação em tempo constante | Nem quem lê o banco descobre o código. Maiúsculas e espaços nas pontas não importam. |
| Erros no código | No máximo **5 erros do mesmo IP no mesmo curso** em 15 a 30 minutos; depois, até o código certo é recusado | Impede adivinhar o código. Usa a mesma tabela de limites das contas, com a chave em hash (nenhum IP em claro). |
| Turmas | O aluno entra na **turma aberta** do curso quando a matrícula fica ativa (a que começou por último); sem turma aberta, na **turma padrão**, criada sozinha | Não depende do método. No pedido com aprovação, vale o momento da aprovação. |
| Progresso | **Só quem está matriculado** registra progresso (`NOT_ENROLLED`) | Senão a aprovação perderia o sentido: o aluno estudaria sem ser aprovado. |
| Quem já estudava | A migration **matricula quem já tem conclusões** num curso (ativo, na turma padrão) | Ninguém perde o que já fez. Rodar de novo não duplica nada. |
| Portal dos cursos | Lista **só os cursos matriculados**; o catálogo, com o método e o estado do pedido, é o prédio de Matrículas | Cada lugar tem uma função. |
| Isolamento | Todo SQL com o filtro da instituição (o repositório recusa o que não tiver) e, no PostgreSQL, **RLS** | Uma instituição não vê nem aprova os pedidos da outra. A FK para o vínculo impede matrícula de quem não é da instituição. |

## Solução

```text
migrations/mysql|pgsql/
├── 000..002   schema_migrations · contas (o mínimo) · as conclusões de hoje
├── 003        course_enrollment_rules · cohorts · enrollments
├── 004        quem já tem progresso fica matriculado (idempotente)
└── 005        (só PostgreSQL) Row Level Security nas três tabelas novas
src/
├── Enrollment/
│   ├── EnrollmentMethod.php · Decision.php       a estratégia e a decisão (ativa, aguarda, recusa)
│   ├── FreeEnrollment · CodeEnrollment · ApprovalEnrollment
│   ├── EnrollmentMethods.php                     a regra gravada ➔ a estratégia (o único lugar que conhece os métodos)
│   ├── CohortPicker.php                          a turma aberta agora
│   ├── EnrollmentService.php                     catálogo, pedido, aprovação, regra, turmas, Portal e a trava do progresso
│   ├── EnrollmentRepository.php · PdoEnrollmentRepository.php   a porta e o adapter (MySQL e PostgreSQL)
│   ├── CodeThrottle.php                          o limite de erros no código
│   └── CourseCatalog.php                         a porta dos cursos que a instituição vê
├── Http/EnrollmentsApi.php                       as rotas, no envelope {status, data|error}
└── Tenant/ · Db/                                 o escopo de instituição e as migrations (dos spikes anteriores)
http/api/enrollments.php                          controller fino (no labs responde 403)
```

### A API

| Rota | Quem | Resposta |
| :--- | :--- | :--- |
| `GET catalog` | aluno | os cursos, o método de cada um e o estado do pedido |
| `GET mine` | aluno | o Portal dos cursos: só os matriculados |
| `POST enroll {courseId, code?}` | aluno | `201` ativa · `202` aguardando · `404` · `422 CODE_INVALID` · `429 CODE_RATE_LIMITED` |
| `GET pending` | admin | os pedidos aguardando |
| `POST decide {userId, courseId, approve}` | admin | aprova (na turma aberta) ou recusa |
| `POST rule {courseId, method, code?}` | admin | o método do curso (o código só vira hash) |
| `POST cohort {courseId, slug, startsAt, endsAt?}` | admin | abre uma turma |

### Os três cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Matrícula livre | A aluna se matricula pelo prédio de Matrículas, e o curso aparece no Portal dos cursos dela na hora. |
| Matrícula com aprovação | O pedido fica "aguardando aprovação": o curso não entra no Portal, e o progresso é recusado até o admin aprovar. |
| Código errado várias vezes | 5 códigos errados do mesmo IP dão `CODE_INVALID`; o 6º, mesmo certo, dá `CODE_RATE_LIMITED`. Passada a janela, o código certo matricula. |

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

- **69 checks** no total: 6 de regra pura, 30 no MySQL (5.7.44 e 8.4) e 33 no PostgreSQL 16 (os mesmos 30 mais 3 do RLS).
- A migration matricula quem já tinha progresso, na turma padrão, e rodar de novo não duplica nada.
- **Aprendizado do PostgreSQL:**
  - num `INSERT ... SELECT DISTINCT`, uma data literal chega como texto, então a versão pgsql da migration põe o `CAST`;
  - o RLS só vale para um papel comum, porque o superusuário do contêiner o ignora. O teste usa `SET ROLE`.

## Limites conhecidos

- Duas matrículas ao mesmo tempo no primeiro uso de um curso podem tentar criar a turma padrão juntas. A chave única barra a segunda, que precisa tentar de novo. Na aplicação, a turma padrão pode ser criada junto com a regra do curso.
- O limite de erros é por IP. Um ataque distribuído entre IPs pede também um limite por conta, como no login.
