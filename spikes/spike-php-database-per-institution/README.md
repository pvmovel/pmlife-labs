# Spike: um banco MySQL por instituição na hospedagem compartilhada

## Problema

Numa plataforma de ensino com várias instituições, cada instituição quer o **controle total dos próprios dados**: o conteúdo dos cursos, os perfis, o progresso, e mais tarde a movimentação dos avatares e o chat. Hoje tudo fica num banco só, separado por uma coluna `tenant_id`.

A infraestrutura é uma revenda de hospedagem compartilhada já paga, sem custo novo. Os limites são por conta cPanel, com produção, homolog e o labs dividindo a mesma conta:
- 25 conexões MySQL simultâneas;
- 25 processos;
- 25% de CPU;
- nenhuma consulta pode passar de 15 s.

Bancos MySQL são ilimitados, mas todo nome ganha o prefixo da conta, e quem cria o banco e liga o usuário a ele é uma pessoa, no painel. Tudo em PHP 8.2 e MySQL 5.7.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Um banco por instituição | O banco da plataforma guarda só o necessário para entrar: o cadastro mínimo, os termos, os vínculos e o estado do banco de cada instituição. O resto vai para o banco da instituição. | A instituição tem os dados dela num banco só dela, que pode ser copiado, exportado ou entregue sem os das outras. |
| Nome do banco | `<prefixo da conta>_<ambiente><id da instituição>`, com o id em 4 dígitos: `conta_pml0001` em produção, `conta_pmlh0001` em homolog | O prefixo sai do nome do banco da plataforma, que já está no arquivo de ambiente. O ambiente sai do host (ou do `APP_ENV` do Cron), o mesmo que escolhe o arquivo de ambiente. Ninguém digita o nome: o admin mostra qual banco criar, e um erro de digitação nunca aponta para o banco de outra instituição ou de outro ambiente. |
| Uma conexão | Um só usuário MySQL, ligado a todos os bancos, e **uma conexão por pedido**, com as tabelas qualificadas (`banco`.`tabela`) | Abrir uma conexão por banco multiplicaria o uso do limite de 25. O MySQL lê tabelas de bancos diferentes do mesmo servidor numa conexão só. |
| Isolamento | Só o resolver monta o banco de um pedido, e ele confere a instituição da sessão e o estado do banco antes, usando só o banco da plataforma | O repositório recebe um banco já conferido e não tem como apontar para outro. Um pedido recusado nunca cita o banco da outra instituição. |
| Aguardando banco | A instituição nasce `waiting` e só fica `active` depois que o script do Cron enxerga o banco, aplica as migrations e faz a réplica | Enquanto isso, ela não aceita alunos. O usuário do site só enxerga os bancos a que foi ligado: um banco criado sem a ligação continua "aguardando". |
| Migrations | Uma pasta só para a instituição, aplicada em cada banco por um **script de linha de comando** (Cron e deploy), com a própria `schema_migrations` e uma trava com nome (`GET_LOCK`) | A API nunca roda DDL. O Cron e o deploy no mesmo minuto não se atropelam, e um banco com erro fica anotado sem segurar os outros. |
| Réplica do cadastro | Cada pessoa com acesso à instituição tem um cadastro no banco dela, **com o mesmo id da plataforma**, incluindo o master da plataforma. Ela é criada no vínculo e na matrícula de equipe, e atualizada no login. | A instituição tem o nome de exibição e o papel sem consultar a plataforma. |
| Sem FK entre bancos | A integridade fica no código: um conferidor aponta quem tem vínculo e falta na réplica, e quem está na réplica sem existir na plataforma, e o backfill do Cron corrige o que falta | Com FK, os bancos ficariam presos um ao outro na restauração e na exportação, e isso não passa para o PostgreSQL. |
| Etapa B | As linhas de uma tabela de hoje com `tenant_id` mudam com `INSERT … SELECT` entre os bancos, numa transação: copia mantendo o id, confere a contagem e uma soma de verificação, e só então apaga a origem. A volta faz o caminho contrário. | Repetir não duplica nada, uma falha desfaz tudo, e há como voltar. |

## Solução

```text
src/Tenant/TenantDatabaseName.php     a regra do nome (o prefixo da conta, o ambiente e o id)
src/Tenant/TenantDatabase.php         o banco conferido; table() devolve `banco`.`tabela`
src/Tenant/TenantDatabaseResolver.php o único caminho até o banco: a sessão e o estado antes
src/Tenant/ProgressRepository.php     um repositório da instituição, sem tenant_id
src/Platform/TenantRegistry.php       o cadastro das instituições e o estado do banco de cada uma
src/Replica/PeopleReplica.php         a réplica com o mesmo id, o backfill e o conferidor
src/Migrations/TenantMigrator.php     o script do Cron: a trava, os bancos visíveis, as migrations e a réplica
src/Migrations/TableMover.php         a Etapa B: mudar e voltar, conferindo a soma, numa transação
scripts/migrate-tenants.php           a linha de comando que o Cron chama (só CLI)
scripts/verify.php                    a regra do nome e os cinco itens contra o MySQL
migrations/mysql-platform/            o banco da plataforma do spike (com a tabela de hoje, com tenant_id)
migrations/mysql-tenant/              as migrations de cada instituição (a réplica e o progresso)
```

O verify faz o papel do cPanel com o usuário root: cria os bancos `spk_*` e liga a eles o usuário "do site". O banco da Cometa é criado sem a ligação. No fim, ele apaga os bancos e revoga os acessos.

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Dados da instituição no banco dela | O progresso do Bruno (Aurora) é gravado no banco da Aurora. Os da plataforma e da Boreal ficam iguais. |
| Isolamento entre bancos | A Carla (Boreal) pede dados da Aurora: `TENANT_FORBIDDEN`, sem nenhum SQL que cite o banco da Aurora (o PDO de teste anota cada comando). |
| Instituição aguardando banco | Antes do script, as três estão `waiting`, e o pedido de um aluno é recusado (`TENANT_DB_WAITING`). A Cometa, com o banco criado mas sem a ligação, continua `waiting` até a ligação. |
| Réplica do cadastro | A Rita, master da plataforma, se matricula como equipe na Aurora e ganha lá o cadastro com o mesmo id, com o papel de equipe. |
| Etapa B | As 300 linhas da Boreal mudam de banco e voltam com a mesma soma. Repetir não duplica, e uma cópia que falha desfaz tudo. |

### Achado: o GRANT sobrevive ao banco

O MySQL guarda o acesso de um usuário a um banco mesmo depois do `DROP DATABASE`. Se um banco com o mesmo nome for criado de novo, o usuário volta a ter acesso. Apagar e recriar o banco de uma instituição pelo phpMyAdmin, em vez de pelo painel de bancos do cPanel, que revoga o acesso, deixaria a ligação antiga valendo. O passo a passo do produto usa só o painel de bancos.

## Como testar

```bash
yarn verify   # só a regra do nome, sem banco

# com o MySQL 5.7 (o da hospedagem) e o 8.4 (o do CI)
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_USER=spike \
  SPIKE_MYSQL_PASS=spikepw SPIKE_MYSQL_ROOT_PASS=rootpw
php scripts/verify.php   # PHP 8.2 com pdo_mysql
docker stop spike-mysql
```

## Resultado

- **34 verificações** no MySQL 5.7.44 e no 8.4.13, todas verdes em rodadas seguidas no mesmo servidor, e 5 sem banco (a regra do nome).
- **Uma conexão:** serviu o banco da plataforma e os três das instituições. A lista de processos mostrou uma conexão aberta do usuário do site.
- **Tabela qualificada × `USE`** (500 consultas cada, preparadas e executadas como num pedido): 371 × 344 µs no 5.7 e 370 × 367 µs no 8.4. A diferença fica no ruído.
- **Script do Cron:** 86 a 114 ms na primeira vez (2 bancos novos) e 34 a 54 ms sem nada a fazer (3 bancos). Fica muito abaixo do limite de 15 s por consulta e pesa pouco na CPU da conta.
- **Etapa B:** 9 a 16 ms para mudar 300 linhas, com a conferência.

## Veredito

O banco por instituição cabe na hospedagem sem conexão a mais e sem custo:
- **Isolamento:** o resolver é o único caminho até o banco, e os testes de isolamento conferem que um pedido recusado não toca no banco de outra instituição.
- **Migrations:** o script de linha de comando com a trava serve ao Cron e ao deploy, e o estado de cada banco fica no cadastro, para o admin mostrar.
- **Réplica:** sem FK, a réplica com o mesmo id fica íntegra pelo backfill e pelo conferidor do Cron.
- **Etapa B:** a mudança tabela a tabela com a soma de verificação, numa transação, permite mudar e voltar sem perder dado. No produto, o `AUTO_INCREMENT` do banco da instituição começa acima do maior id da origem, para os ids movidos e os novos não colidirem.
- **Caminho de escala:** no PostgreSQL, a mesma ideia vira um banco ou um schema por instituição, com o RLS como segunda defesa.

Dados 100% fictícios.
