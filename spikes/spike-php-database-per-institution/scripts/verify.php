<?php
declare(strict_types=1);

// Prova o spike: a regra do nome do banco (sempre) e, com um MySQL configurado, os cinco itens da US47 com nomes
// fictícios: o banco da plataforma e os das instituições numa só conexão, o isolamento, o script de migrations em
// vários bancos (com a trava e o banco ainda sem ligação), a réplica do cadastro e a mudança de uma tabela com
// tenant_id para o banco da instituição, com a volta, sem perder dado. No fim, as medições.
//   SPIKE_MYSQL_HOST/PORT/USER/PASS: o usuário "do site" (o mesmo do CI do labs)
//   SPIKE_MYSQL_ROOT_USER/ROOT_PASS: faz o papel do cPanel (cria os bancos e liga o usuário a eles)
// ATENÇÃO: o script apaga e recria os bancos `spk_*` do servidor informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/src/factory.php';

use Spike\TenantDb\Db\ConnectionFactory;
use Spike\TenantDb\Db\SqlFile;
use Spike\TenantDb\Migrations\TableMover;
use Spike\TenantDb\Migrations\TenantMigrator;
use Spike\TenantDb\Tenant\ProgressRepository;
use Spike\TenantDb\Tenant\TenantAccessDenied;
use Spike\TenantDb\Tenant\TenantDatabase;
use Spike\TenantDb\Tenant\TenantDatabaseName;

$root = dirname(__DIR__);
$failed = false;
$total = 0;

function check(bool $ok, string $label): void
{
    global $failed, $total;
    $total++;
    echo ($ok ? '✅ ' : '❌ ') . $label . "\n";
    if (!$ok) {
        $failed = true;
    }
}

/** O código da recusa, ou null se a chamada passou. */
function denied(callable $call): ?string
{
    try {
        $call();
        return null;
    } catch (TenantAccessDenied $e) {
        return $e->apiCode;
    } catch (InvalidArgumentException $e) {
        return $e->getMessage();
    }
}

echo "== O nome do banco da instituição ==\n";
check(TenantDatabaseName::for('conta_pmlife', 'production', 1) === 'conta_pml0001' && TenantDatabaseName::for('conta_pmlifeh', 'homolog', 1) === 'conta_pmlh0001', 'produção e homolog: <prefixo da conta>_pml0001 e _pmlh0001, com o prefixo tirado do banco da plataforma');
check(TenantDatabaseName::for('conta_pmlife', 'production', 12345) === 'conta_pml12345' && TenantDatabaseName::for('pmlife', 'development', 7) === 'pmld0007', 'o id passa de 4 dígitos sem cortar; sem prefixo (MySQL local), só o código');
check(denied(fn () => TenantDatabaseName::for('conta_pmlife', 'staging', 1)) === 'ENVIRONMENT_UNKNOWN' && denied(fn () => TenantDatabaseName::for('conta_pmlife', 'production', 0)) === 'TENANT_ID_INVALID' && denied(fn () => TenantDatabaseName::for('Conta!_x', 'production', 1)) === 'ACCOUNT_PREFIX_INVALID', 'ambiente, id e prefixo fora da regra são recusados');
check(TenantDatabaseName::isValid('conta_pml0001') && !TenantDatabaseName::isValid('conta_pmlife') && !TenantDatabaseName::isValid('conta_pml0001`; DROP') && !TenantDatabaseName::isValid('mysql'), 'só um nome gerado pela regra é aceito (nem o da plataforma, nem um com crase)');
check(denied(fn () => TenantDatabase::trusted(1, 'information_schema')) === 'DATABASE_NAME_INVALID' && denied(fn () => TenantDatabase::trusted(1, 'conta_pml0001')->table('people`; --')) === 'TABLE_NAME_INVALID', 'o banco e a tabela qualificados não aceitam nome fora do formato');

$host = getenv('SPIKE_MYSQL_HOST');
$rootPass = getenv('SPIKE_MYSQL_ROOT_PASS');
if (!$host || $rootPass === false) {
    echo "\n⚠️  Sem SPIKE_MYSQL_* e SPIKE_MYSQL_ROOT_PASS: só a regra do nome foi testada.\n";
    echo "\n" . ($failed ? '❌' : '✅') . " {$total} verificações\n";
    exit($failed ? 1 : 0);
}
$port = (int) (getenv('SPIKE_MYSQL_PORT') ?: 3306);
$user = (string) getenv('SPIKE_MYSQL_USER');
$pass = (string) getenv('SPIKE_MYSQL_PASS');
$cpanel = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", (string) (getenv('SPIKE_MYSQL_ROOT_USER') ?: 'root'), (string) $rootPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$version = (string) $cpanel->getAttribute(PDO::ATTR_SERVER_VERSION);
echo "\n== MySQL {$version} ==\n";

// O papel do cPanel: o prefixo da conta é "spk"; o banco da plataforma e os das instituições Aurora (1), Boreal (2) e
// Cometa (3). O da Cometa nasce sem a ligação do usuário, como quando o banco foi criado mas o passo de ligar ficou
// para depois. O banco de homolog da Aurora (pmlh) existe, mas é de outro ambiente.
$platform = 'spk_platform';
$spikeDatabases = [$platform, 'spk_pml0001', 'spk_pml0002', 'spk_pml0003', 'spk_pmlh0001'];
// Achado do spike: o MySQL guarda o GRANT de um banco mesmo depois do DROP DATABASE. Recriar o banco com o mesmo nome
// devolve o acesso ao usuário; por isso a limpeza revoga também (o cPanel faz as duas coisas ao apagar um banco).
$drop = static function () use ($cpanel, $spikeDatabases, $user): void {
    foreach ($cpanel->query("SHOW DATABASES LIKE 'spk\\_%'")->fetchAll(PDO::FETCH_COLUMN) as $db) {
        $cpanel->exec("DROP DATABASE `{$db}`");
    }
    foreach ($spikeDatabases as $db) {
        $has = $cpanel->prepare('SELECT COUNT(*) FROM mysql.db WHERE Db = ? AND User = ?');
        $has->execute([$db, $user]);
        if ((int) $has->fetchColumn() > 0) {
            $cpanel->exec("REVOKE ALL PRIVILEGES ON `{$db}`.* FROM '{$user}'@'%'");
        }
    }
};
$drop();
$grant = static fn (string $db) => $cpanel->exec("GRANT ALL PRIVILEGES ON `{$db}`.* TO '{$user}'@'%'");
foreach ($spikeDatabases as $db) {
    $cpanel->exec("CREATE DATABASE `{$db}` CHARACTER SET utf8mb4");
}
foreach ([$platform, 'spk_pml0001', 'spk_pml0002', 'spk_pmlh0001'] as $db) {
    $grant($db);
}

$config = ['host' => $host, 'port' => $port, 'db' => $platform, 'user' => $user, 'pass' => $pass];
$pdo = ConnectionFactory::create($config);
try {
    foreach (SqlFile::statements((string) file_get_contents("{$root}/migrations/mysql-platform/001_create_platform.sql")) as $sql) {
        $pdo->exec($sql);
    }
    $pdo->exec("INSERT INTO tenants (id, slug, name) VALUES (1, 'aurora', 'Aurora Demo'), (2, 'boreal', 'Boreal Demo'), (3, 'cometa', 'Cometa Demo')");
    $people = [
        // id, e-mail, nome, master da plataforma, [instituição => papel]
        [1, 'rita@demo.test', 'Rita Nunes', 1, []],
        [2, 'ana@demo.test', 'Ana Souza', 0, [1 => 'tenant_admin']],
        [3, 'bruno@demo.test', 'Bruno Rocha', 0, [1 => 'student']],
        [4, 'carla@demo.test', 'Carla Campos', 0, [2 => 'student']],
        [5, 'davi@demo.test', 'Davi Lima', 0, [1 => 'student', 2 => 'tutor']],
    ];
    foreach ($people as [$id, $email, $name, $admin, $links]) {
        $pdo->prepare('INSERT INTO users (id, email, password_hash, display_name, platform_admin) VALUES (?, ?, ?, ?, ?)')->execute([$id, $email, '$2y$10$fictício', $name, $admin]);
        foreach ($links as $tenant => $role) {
            $pdo->prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)')->execute([$id, $tenant, $role]);
        }
    }
    // O progresso de hoje, com tenant_id, no banco da plataforma: 300 linhas da Aurora e 300 da Boreal.
    $ins = $pdo->prepare('INSERT INTO progress_events (tenant_id, user_id, course_id, quest_id, xp, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for ($i = 0; $i < 600; $i++) {
        $tenant = $i % 2 === 0 ? 1 : 2;
        $ins->execute([$tenant, $tenant === 1 ? 3 : 4, 'curso-demo', 'missao-' . ($i % 9), 10 + $i % 7, sprintf('2026-10-%02d 10:%02d:00', 1 + $i % 28, $i % 60)]);
    }

    $t = spike_tenant_db($pdo, $platform, 'production');
    ['registry' => $registry, 'resolver' => $resolver, 'replica' => $replica, 'migrator' => $migrator] = $t;
    $now = '2026-11-06 12:00:00';
    $count = static fn (string $sql): int => (int) $pdo->query($sql)->fetchColumn();

    echo "\n-- Instituição aguardando banco --\n";
    check(array_column($registry->all(), 'db_state') === ['waiting', 'waiting', 'waiting'], 'Gherkin: antes do script, as três instituições estão "aguardando banco"');
    check(denied(fn () => $resolver->forRequest(1, 1)) === 'TENANT_DB_WAITING', 'Gherkin: a instituição aguardando banco ainda não aceita alunos (o pedido é recusado antes de tocar no banco dela)');

    echo "\n-- Script de migrations em vários bancos (o Cron) --\n";
    $start = hrtime(true);
    $run = $migrator->run($now);
    $firstMs = (hrtime(true) - $start) / 1e6;
    $byId = array_column($run['tenants'], null, 'id');
    check($byId[1]['state'] === 'active' && $byId[1]['applied'] === ['001', '002'] && $byId[2]['state'] === 'active' && $byId[2]['applied'] === ['001', '002'], 'Aurora e Boreal: as duas migrations aplicadas, cada banco com a própria schema_migrations, e "ativo"');
    check($byId[3]['state'] === 'waiting' && $byId[3]['db'] === 'spk_pml0003', 'Cometa: o banco existe no servidor, mas o usuário do site não foi ligado a ele; continua "aguardando banco"');
    check($byId[1]['people'] === 3 && $byId[2]['people'] === 2, 'o backfill da réplica: Aurora com Ana, Bruno e Davi; Boreal com Carla e Davi (a mesma pessoa nas duas)');
    check($registry->all()[0]['db_version'] === '002' && $count("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'spk_pmlh0001'") === 0, 'a versão de cada banco fica no cadastro (o admin mostra); o banco de homolog da Aurora não foi tocado pelo script de produção');
    $again = $migrator->run($now);
    check(array_merge(...array_column($again['tenants'], 'applied')) === [], 'rodar de novo não aplica nada (o Cron de cada hora é barato)');
    $other = ConnectionFactory::create($config);
    $other->query("SELECT GET_LOCK('" . TenantMigrator::LOCK . "', 0)");
    check($migrator->run($now)['status'] === 'busy', 'com outra execução segurando a trava (o deploy e o Cron juntos), o script não faz nada');
    $other->query("SELECT RELEASE_LOCK('" . TenantMigrator::LOCK . "')");
    $other = null;
    $grant('spk_pml0003');
    $third = array_column($migrator->run($now)['tenants'], null, 'id')[3];
    check($third['state'] === 'active' && $third['applied'] === ['001', '002'] && $third['people'] === 0, 'depois de ligar o usuário ao banco da Cometa, o Cron seguinte a migra e ela fica ativa');
    $output = [];
    $env = sprintf('APP_ENV=production SPIKE_MYSQL_HOST=%s SPIKE_MYSQL_PORT=%d SPIKE_MYSQL_USER=%s SPIKE_MYSQL_PASS=%s SPIKE_PLATFORM_DB=%s', escapeshellarg($host), $port, escapeshellarg($user), escapeshellarg($pass), $platform);
    exec("{$env} " . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg("{$root}/scripts/migrate-tenants.php") . ' 2>&1', $output, $exit);
    check($exit === 0 && count(preg_grep('/^spk_pml000[123]  active/', $output)) === 3, 'o script de linha de comando (o que o Cron chama) responde: ' . ($output[3] ?? '?'));

    echo "\n-- Dados da instituição no banco dela --\n";
    $platformBefore = $count('SELECT COUNT(*) FROM progress_events');
    $aurora = $resolver->forRequest(1, 1);
    (new ProgressRepository($pdo, $aurora))->complete(3, 'curso-demo', 'missao-nova', 50, $now);
    check($count('SELECT COUNT(*) FROM `spk_pml0001`.`progress_events`') === 1 && $count('SELECT COUNT(*) FROM progress_events') === $platformBefore && $count('SELECT COUNT(*) FROM `spk_pml0002`.`progress_events`') === 0, 'Gherkin: o progresso do Bruno (Aurora) vai para o banco da Aurora, e não para o da plataforma nem para o da Boreal');
    check((new ProgressRepository($pdo, $aurora))->xpOf(3, 'curso-demo') === 50, 'o repositório lê o banco da instituição pela mesma conexão');

    echo "\n-- Isolamento entre bancos --\n";
    $pdo->log = [];
    $code = denied(fn () => $resolver->forRequest(2, 1));
    $touched = array_filter($pdo->log, static fn (string $sql): bool => str_contains($sql, 'spk_pml0001'));
    check($code === 'TENANT_FORBIDDEN' && $touched === [], 'Gherkin: a Carla (Boreal) pede dados da Aurora; o servidor recusa sem um único SQL citando o banco da Aurora');
    check($resolver->forRequest(2, 1, platformAdmin: true)->name === 'spk_pml0001' && denied(fn () => $resolver->forRequest(1, 99, platformAdmin: true)) === 'TENANT_NOT_FOUND', 'o master da plataforma escolhe a instituição em foco (como no admin); uma que não existe é recusada');
    $boreal = $resolver->forRequest(2, 2);
    check((new ProgressRepository($pdo, $boreal))->xpOf(3, 'curso-demo') === 0, 'o repositório da Boreal não vê o progresso da Aurora, nem com o mesmo aluno e o mesmo curso');

    echo "\n-- Réplica do cadastro --\n";
    $replica->upsert($aurora, 1, 'Rita Nunes', 'platform_admin', true, $now);
    $rita = $pdo->query('SELECT id, role, staff FROM `spk_pml0001`.`people` WHERE id = 1')->fetch();
    check($rita !== false && (int) $rita['id'] === 1 && $rita['role'] === 'platform_admin' && (int) $rita['staff'] === 1, 'Gherkin: a Rita (master da plataforma) se matricula como equipe na Aurora e ganha o cadastro lá, com o mesmo id da plataforma');
    $pdo->exec("UPDATE users SET display_name = 'Bruno R. Rocha' WHERE id = 3");
    $replica->upsert($aurora, 3, 'Bruno R. Rocha', 'student', false, $now);
    check($pdo->query('SELECT display_name FROM `spk_pml0001`.`people` WHERE id = 3')->fetchColumn() === 'Bruno R. Rocha', 'no login, a réplica é atualizada com o nome de exibição da plataforma');
    check($replica->check($aurora) === ['missing' => [], 'orphans' => []], 'sem chave estrangeira entre os bancos, o conferidor não acha ninguém faltando nem sobrando');
    $pdo->exec("INSERT INTO `spk_pml0001`.`people` (id, display_name, role, staff, updated_at) VALUES (99, 'Fantasma', 'student', 0, '{$now}')");
    $pdo->exec('INSERT INTO memberships (user_id, tenant_id, role) VALUES (4, 1, \'student\')');
    check($replica->check($aurora) === ['missing' => [4], 'orphans' => [99]], 'o conferidor acha a pessoa vinculada sem réplica (Carla) e a réplica sem pessoa na plataforma (99)');
    $replica->backfill($aurora, $now);
    check($replica->check($aurora)['missing'] === [], 'o backfill do Cron corrige a que falta (a órfã fica no relatório, para o master decidir)');

    echo "\n-- Etapa B: a tabela com tenant_id muda para o banco da instituição --\n";
    $mover = new TableMover($pdo, $platform);
    $original = $mover->checksumOf('`spk_platform`.`progress_events`', 2);
    $auroraRows = $mover->checksumOf('`spk_platform`.`progress_events`', 1);
    $start = hrtime(true);
    $out = $mover->moveOut($boreal);
    $moveMs = (hrtime(true) - $start) / 1e6;
    check($out['moved'] === 300 && $mover->checksumOf($boreal->table('progress_events')) === $original && $count('SELECT COUNT(*) FROM progress_events WHERE tenant_id = 2') === 0, 'as 300 linhas da Boreal mudam para o banco dela com o mesmo id, a mesma contagem e a mesma soma de verificação, e saem da plataforma');
    check($mover->checksumOf('`spk_platform`.`progress_events`', 1) === $auroraRows, 'as linhas da Aurora na plataforma não mudam');
    check($mover->moveOut($boreal)['moved'] === 0 && $mover->checksumOf($boreal->table('progress_events')) === $original, 'repetir a mudança não duplica nem perde nada');
    $back = $mover->moveBack($boreal);
    check($back['moved'] === 300 && $mover->checksumOf('`spk_platform`.`progress_events`', 2) === $original && $count('SELECT COUNT(*) FROM `spk_pml0002`.`progress_events`') === 0, 'a volta: as linhas retornam à plataforma, com o tenant_id e a mesma soma');
    $pdo->exec("DROP TABLE `spk_pml0002`.`progress_events`");
    $failedMove = null;
    try {
        $mover->moveOut($boreal);
    } catch (Throwable $e) {
        $failedMove = $e;
    }
    check($failedMove !== null && $mover->checksumOf('`spk_platform`.`progress_events`', 2) === $original, 'se a cópia falha (aqui, sem a tabela no destino), a transação desfaz tudo e a origem fica inteira');
    $pdo->exec("DELETE FROM `spk_pml0002`.`schema_migrations` WHERE version = '002'");
    $migrator->run($now);
    check($mover->moveOut($boreal)['moved'] === 300, 'com o banco migrado de novo pelo Cron, a mudança passa');

    echo "\n-- Medições (MySQL {$version}) --\n";
    $mine = $pdo->query('SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE USER = SUBSTRING_INDEX(CURRENT_USER(), \'@\', 1)')->fetchColumn();
    check((int) $mine === 1, 'uma conexão só serviu o banco da plataforma e os três das instituições (conexões abertas do usuário do site: ' . $mine . ')');
    $repo = new ProgressRepository($pdo, $aurora);
    $n = 500;
    $start = hrtime(true);
    for ($i = 0; $i < $n; $i++) {
        $repo->xpOf(3, 'curso-demo');
    }
    $qualified = (hrtime(true) - $start) / 1e3 / $n;
    $pdo->exec('USE `spk_pml0001`');
    // As duas do mesmo jeito: preparar e executar a cada vez, como num pedido.
    $start = hrtime(true);
    for ($i = 0; $i < $n; $i++) {
        $st = $pdo->prepare('SELECT COALESCE(SUM(xp), 0) FROM progress_events WHERE user_id = ? AND course_id = ?');
        $st->execute([3, 'curso-demo']);
        $st->fetchColumn();
    }
    $plain = (hrtime(true) - $start) / 1e3 / $n;
    $pdo->exec("USE `{$platform}`");
    $start = hrtime(true);
    $migrator->run($now);
    $idleMs = (hrtime(true) - $start) / 1e6;
    printf("ℹ️  consulta com a tabela qualificada (`banco`.`tabela`): %.0f µs; com USE e sem qualificar: %.0f µs (%d vezes cada)\n", $qualified, $plain, $n);
    printf("ℹ️  script do Cron: %.0f ms na primeira vez (2 bancos novos); %.0f ms sem nada a fazer (3 bancos)\n", $firstMs, $idleMs);
    printf("ℹ️  Etapa B: %.0f ms para mudar 300 linhas, com a conferência\n", $moveMs);
    check($qualified < $plain * 1.5 + 50, 'a tabela qualificada não pesa: a diferença para o USE fica no ruído da medição');
    check($idleMs < 1000 && $firstMs < 5000, 'o script do Cron fica bem abaixo do limite de 15 s por consulta e não segura a CPU da conta');
} finally {
    $pdo = null;
    $drop();
}

echo "\n" . ($failed ? '❌' : '✅') . " {$total} verificações\n";
exit($failed ? 1 : 0);
