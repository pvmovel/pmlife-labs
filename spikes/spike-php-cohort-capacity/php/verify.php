<?php
declare(strict_types=1);

// Prova o spike da US48: os casos de conformidade no espelho em PHP (sempre) e, em cada banco configurado por
// variáveis de ambiente, as turmas de antes migradas sem tirar ninguém, os cenários do Gherkin, a matrícula de equipe,
// o isolamento entre instituições e duas matrículas ao mesmo tempo na última vaga (com e sem a trava).
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. As tabelas têm o prefixo cc_ e são apagadas no fim (os
// spikes dividem o banco do CI). Dados 100% fictícios.

require_once __DIR__ . '/src/bootstrap.php';

use Spike\Cohort\CohortCapacity;
use Spike\Cohort\CohortEnrollment;
use Spike\Cohort\Db\ConnectionFactory;
use Spike\Cohort\Db\Migrator;
use Spike\Cohort\LimitRejected;

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

function refused(callable $call): string
{
    try {
        $call();
        return 'OK';
    } catch (LimitRejected $e) {
        return $e->reason;
    }
}

echo "== Casos de conformidade (os mesmos do TypeScript) ==\n";
$files = glob("{$root}/cases/*.json") ?: [];
sort($files);
foreach ($files as $file) {
    $c = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    $ok = match ($c['kind']) {
        'limit' => array_reduce($c['checks'], static fn (bool $acc, array $k): bool => $acc && CohortCapacity::limitProblem($k[0], $k[1]) === $k[2], true),
        'options' => array_reduce($c['checks'], static fn (bool $acc, array $k): bool => $acc && CohortCapacity::limitOptions($k[0]) === $k[1], true),
        'choose' => CohortCapacity::choose($c['cohorts'], $c['now'], $c['courseLimit'], $c['ceiling']) === $c['expect'],
    };
    check($ok, basename($file, '.json') . ': ' . $c['description']);
}
check(count($files) >= 12, count($files) . ' casos, os mesmos que o vitest roda no Domain em TypeScript');

$databases = [];
foreach (['mysql' => 'SPIKE_MYSQL_', 'pgsql' => 'SPIKE_PGSQL_'] as $driver => $prefix) {
    if (getenv($prefix . 'HOST')) {
        $databases[$driver] = $prefix;
    }
}
if ($databases === []) {
    echo "\n(sem banco configurado: só as regras puras; defina SPIKE_MYSQL_* e/ou SPIKE_PGSQL_* para o resto)\n";
}

const NOW = '2026-11-06 12:00:00';
const TABLES = ['cc_enrollments', 'cc_course_cohort_settings', 'cc_cohorts', 'cc_tenants', 'cc_schema_migrations'];

foreach ($databases as $driver => $prefix) {
    $config = [
        'DB_DRIVER' => $driver,
        'DB_HOST' => getenv($prefix . 'HOST'),
        'DB_PORT' => getenv($prefix . 'PORT'),
        'DB_NAME' => getenv($prefix . 'DB'),
        'DB_USER' => getenv($prefix . 'USER'),
        'DB_PASS' => getenv($prefix . 'PASS'),
    ];
    $pdo = ConnectionFactory::create($config);
    $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    echo "\n== {$driver} (" . (preg_match('/\d+(?:\.\d+)+/', $version, $m) ? $m[0] : $version) . ") ==\n";
    $drop = static function () use ($pdo, $driver): void {
        foreach (TABLES as $t) {
            $pdo->exec("DROP TABLE IF EXISTS {$t}" . ($driver === 'pgsql' ? ' CASCADE' : ''));
        }
    };
    $drop();
    try {
        $migrator = new Migrator($pdo, "{$root}/migrations");

        echo "-- as turmas de antes da US48\n";
        $migrator->migrate('001');
        $pdo->exec("INSERT INTO cc_tenants (slug, name) VALUES ('aurora', 'Escola Aurora (fictícia)'), ('boreal', 'Escola Boreal (fictícia)')");
        $aurora = (int) $pdo->query("SELECT id FROM cc_tenants WHERE slug = 'aurora'")->fetchColumn();
        $boreal = (int) $pdo->query("SELECT id FROM cc_tenants WHERE slug = 'boreal'")->fetchColumn();
        $pdo->prepare("INSERT INTO cc_cohorts (tenant_id, course_id, slug, starts_at, ends_at) VALUES (?, 'ingles', 'padrao', '1970-01-01 00:00:00', NULL)")->execute([$aurora]);
        $padrao = (int) $pdo->query("SELECT id FROM cc_cohorts WHERE slug = 'padrao'")->fetchColumn();
        $old = $pdo->prepare("INSERT INTO cc_enrollments (tenant_id, user_id, course_id, status, cohort_id, requested_at) VALUES (?, ?, 'ingles', 'active', ?, '2026-10-01 10:00:00')");
        for ($u = 1; $u <= 30; $u++) {
            $old->execute([$aurora, $u, $padrao]);
        }
        $migrator->migrate();
        check($migrator->pending() === [] && $migrator->migrate() === [], 'a 002 entra sobre o banco de antes, e rodar de novo não muda nada (idempotente)');
        $svcA = new CohortEnrollment($pdo, $aurora);
        $ingles = $svcA->cohorts('ingles');
        check(count($ingles) === 1 && $ingles[0]['capacity'] === 12 && $ingles[0]['enrolled'] === 30 && $svcA->ceiling() === 12, 'Gherkin "Turmas de hoje": a padrao ganhou o limite 12, e os 30 alunos continuam nela; o teto da instituição nasce em 12');
        check($svcA->enroll(31, 'ingles', NOW) === 'turma-2', 'e a próxima matrícula vai para a turma-2, aberta sozinha');
        check($svcA->cohorts('ingles')[0]['enrolled'] === 30, 'ninguém saiu da padrao');

        echo "-- o teto da plataforma e o limite da instituição\n";
        check(refused(static fn () => CohortEnrollment::setCeiling($pdo, $aurora, 18)) === 'COHORT_LIMIT_INVALID' && refused(static fn () => CohortEnrollment::setCeiling($pdo, $aurora, 52)) === 'COHORT_LIMIT_INVALID', 'o teto também é múltiplo de 4, de 4 a 48');
        CohortEnrollment::setCeiling($pdo, $aurora, 16);
        check(refused(static fn () => $svcA->setCourseLimit('ciencias', 20)) === 'COHORT_LIMIT_ABOVE_CEILING', 'Gherkin "Teto da plataforma": com o teto de 16, a Aurora não usa 20 por turma');
        check(refused(static fn () => $svcA->setCourseLimit('ciencias', 10)) === 'COHORT_LIMIT_INVALID', 'Gherkin "Só múltiplos de 4": 10 é recusado');
        check(refused(static fn () => $svcA->setCourseLimit('ciencias', 12)) === 'OK' && CohortCapacity::limitOptions($svcA->ceiling()) === [4, 8, 12, 16], 'o 12 vale, e o seletor da Aurora oferece 4, 8, 12 e 16');

        echo "-- lotação e turma seguinte\n";
        $slugs = [];
        for ($u = 101; $u <= 113; $u++) {
            $slugs[] = $svcA->enroll($u, 'ciencias', NOW);
        }
        check(array_count_values($slugs) === ['turma-1' => 12, 'turma-2' => 1], 'Gherkin "Turma lotada abre a seguinte": 12 na turma-1, e o 13º abre a turma-2 com o mesmo limite');
        $turma2 = $svcA->cohorts('ciencias')[1];
        check($turma2['slug'] === 'turma-2' && $turma2['capacity'] === 12 && $turma2['startsAt'] === NOW && $turma2['endsAt'] === null, 'a turma-2 começa na matrícula, sem fim, com o limite do curso');
        $pdo->prepare("UPDATE cc_cohorts SET ends_at = '2026-11-06 11:00:00' WHERE tenant_id = ? AND course_id = 'ciencias' AND slug = 'turma-2'")->execute([$aurora]);
        check($svcA->enroll(114, 'ciencias', NOW) === 'turma-3', 'a turma-2 venceu (data de fim) com vaga: a matrícula seguinte abre a turma-3 (lotação ou data, o que vier primeiro)');

        echo "-- matrícula de equipe e isolamento\n";
        $svcA->enrollStaff(900, 'ciencias', NOW);
        $after = array_column($svcA->cohorts('ciencias'), 'enrolled', 'slug');
        check($after === ['turma-1' => 12, 'turma-2' => 1, 'turma-3' => 1], 'o master entra como equipe: sem turma e sem ocupar vaga');
        $svcB = new CohortEnrollment($pdo, $boreal);
        check($svcB->cohorts('ciencias') === [] && $svcB->enroll(201, 'ciencias', NOW) === 'turma-1' && $svcB->ceiling() === 12, 'a Boreal não vê as turmas da Aurora, começa na turma-1 dela e tem o próprio teto');

        echo "-- duas matrículas ao mesmo tempo na última vaga\n";
        $run = static function (string $courseId, bool $lock) use ($driver, $aurora, $svcA): array {
            $svcA->setCourseLimit($courseId, 12);
            for ($u = 1; $u <= 11; $u++) {
                $svcA->enroll(1000 + $u, $courseId, NOW);
            }
            $start = microtime(true) + 0.8;
            $running = [];
            foreach ([2001, 2002] as $user) {
                $cmd = [PHP_BINARY, __DIR__ . '/worker.php', $driver, (string) $aurora, $courseId, (string) $user, $lock ? '1' : '0', '400', sprintf('%.6F', $start), NOW];
                $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
                $running[] = [$proc, $pipes];
            }
            $out = [];
            foreach ($running as [$proc, $pipes]) {
                $out[] = trim((string) stream_get_contents($pipes[1])) . trim((string) stream_get_contents($pipes[2]));
                proc_close($proc);
            }
            sort($out);
            return $out;
        };
        $t0 = microtime(true);
        $locked = $run('corrida-com-trava', true);
        $elapsed = microtime(true) - $t0;
        $counts = array_column($svcA->cohorts('corrida-com-trava'), 'enrolled', 'slug');
        check($locked === ['turma-1', 'turma-2'] && $counts === ['turma-1' => 12, 'turma-2' => 1], 'Gherkin "Duas matrículas na última vaga": com a trava, só uma entra na turma-1 (12 de 12) e a outra vai para a turma-2');
        check($elapsed >= 1.6, 'a segunda esperou a primeira terminar (as duas levaram ' . number_format($elapsed, 1, ',', '') . ' s, com 0,4 s de pausa em cada)');
        $free = $run('corrida-sem-trava', false);
        $freeCounts = array_column($svcA->cohorts('corrida-sem-trava'), 'enrolled', 'slug');
        check($free === ['turma-1', 'turma-1'] && $freeCounts === ['turma-1' => 13], 'sem a trava, as duas leem 11 de 12 e entram: 13 numa turma de 12 (é por isso que a matrícula trava a linha do curso)');
    } finally {
        $drop();
    }
}

echo "\n" . ($failed ? "❌ {$total} checks, com falhas" : "✅ Tudo certo ({$total} checks)") . "\n";
exit($failed ? 1 : 0);
