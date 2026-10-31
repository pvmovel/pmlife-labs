<?php
declare(strict_types=1);

// Prova o spike: as regras puras (sempre) e, em cada banco configurado por variáveis de ambiente, a migração de quem
// já tem progresso, os cenários do Gherkin da US44, as turmas, a trava do progresso, o limite do código de convite, o
// isolamento entre instituições (e o RLS do PostgreSQL) e a API no envelope do contrato.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script apaga as tabelas do spike no banco
// informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';

use Spike\Enrollment\Db\ConnectionFactory;
use Spike\Enrollment\Db\Migrator;
use Spike\Enrollment\Enrollment\ApprovalEnrollment;
use Spike\Enrollment\Enrollment\CodeEnrollment;
use Spike\Enrollment\Enrollment\CohortPicker;
use Spike\Enrollment\Enrollment\CourseCatalog;
use Spike\Enrollment\Enrollment\Decision;
use Spike\Enrollment\Enrollment\EnrollmentMethods;
use Spike\Enrollment\Enrollment\EnrollmentRejected;
use Spike\Enrollment\Enrollment\FreeEnrollment;
use Spike\Enrollment\Http\EnrollmentsApi;
use Spike\Enrollment\Tenant\TenantContext;
use Spike\Enrollment\Tenant\TenantScopedRepository;

const SALT = 'sal-de-teste-do-spike';
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

/** O código de erro de uma chamada que deve ser recusada (ou "OK"). */
function refused(callable $call): string
{
    try {
            $call();
            return 'OK';
        } catch (EnrollmentRejected $e) {
            return $e->reason;
        }
    }

    echo "== Regras puras ==\n";
    check((new FreeEnrollment())->decide(null)->outcome === Decision::ACTIVE && (new ApprovalEnrollment())->decide(null)->outcome === Decision::PENDING, 'livre ativa na hora; com aprovação fica aguardando o admin');
    $hash = CodeEnrollment::hash('ASTRO-2026', SALT);
    $code = new CodeEnrollment($hash, SALT);
    check($code->decide(' astro-2026 ')->outcome === Decision::ACTIVE && $code->decide('ASTRO-2025')->error === 'CODE_INVALID' && $code->decide('')->error === 'CODE_REQUIRED', 'código: o certo ativa (maiúsculas e espaços não importam); o errado é CODE_INVALID; vazio, CODE_REQUIRED');
    check(!str_contains($hash, 'ASTRO') && strlen($hash) === 64 && $hash !== CodeEnrollment::hash('ASTRO-2026', 'outro-sal'), 'o código fica só como HMAC-SHA256 com o sal do servidor');
    check(EnrollmentMethods::for(null, SALT)->name() === 'free' && EnrollmentMethods::for(['method' => 'approval', 'code_hash' => null], SALT)->name() === 'approval', 'curso sem regra tem matrícula livre; a regra escolhe a estratégia (Open/Closed)');
    $now = new DateTimeImmutable('2026-10-31 12:00:00', new DateTimeZone('UTC'));
    $cohorts = [
        ['id' => 1, 'slug' => 'padrao', 'starts_at' => '1970-01-01 00:00:00', 'ends_at' => null],
        ['id' => 2, 'slug' => '2026-1', 'starts_at' => '2026-01-01 00:00:00', 'ends_at' => '2026-07-01 00:00:00'],
        ['id' => 3, 'slug' => '2026-2', 'starts_at' => '2026-07-01 00:00:00', 'ends_at' => '2027-01-01 00:00:00'],
        ['id' => 4, 'slug' => 'reforco', 'starts_at' => '2026-10-01 00:00:00', 'ends_at' => null],
        ['id' => 5, 'slug' => '2027-1', 'starts_at' => '2027-01-01 00:00:00', 'ends_at' => null],
    ];
    check(CohortPicker::open($cohorts, $now)['slug'] === 'reforco', 'turma: entre as abertas, a que começou por último (a encerrada, a futura e a padrão ficam de fora)');
    check(CohortPicker::open([$cohorts[0], $cohorts[1]], $now) === null, 'sem turma aberta, nenhuma: o serviço usa a turma padrão');

    $databases = [];
    foreach (['mysql' => 'SPIKE_MYSQL', 'pgsql' => 'SPIKE_PGSQL'] as $driver => $prefix) {
        if (getenv("{$prefix}_HOST")) {
            $databases[$driver] = $prefix;
        }
    }
    if ($databases === []) {
        echo "\n⚠️  Nenhum banco configurado (SPIKE_MYSQL_* / SPIKE_PGSQL_*): só as regras foram testadas.\n";
    }

    /** As tabelas do spike, das que apontam para as que são apontadas. */
    const TABLES = ['enrollments', 'cohorts', 'course_enrollment_rules', 'quest_completions', 'memberships', 'users', 'tenants', 'auth_rate_limit', 'schema_migrations'];

    /** Apaga as tabelas do spike. O banco do CI é compartilhado pelos spikes: ninguém deixa FK apontando para a tabela do outro. */
    function drop_tables(PDO $pdo, string $driver): void
    {
        if ($driver === 'mysql') {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0'); // uma tabela de outro spike pode apontar para users ou tenants
        }
        foreach (TABLES as $t) {
            $pdo->exec("DROP TABLE IF EXISTS {$t}" . ($driver === 'pgsql' ? ' CASCADE' : ''));
        }
        if ($driver === 'mysql') {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    $catalog = new class () implements CourseCatalog {
        public function courseIds(): array
        {
            return ['astro-demo', 'escola-demo.clima', 'escola-demo.lab'];
        }
    };

    foreach ($databases as $driver => $prefix) {
        $pdo = ConnectionFactory::create([
            'DB_DRIVER' => $driver,
            'DB_HOST' => getenv("{$prefix}_HOST"),
            'DB_PORT' => getenv("{$prefix}_PORT"),
            'DB_NAME' => getenv("{$prefix}_DB"),
            'DB_USER' => getenv("{$prefix}_USER"),
            'DB_PASS' => (string) getenv("{$prefix}_PASS"),
        ]);
        echo "\n== {$driver} " . $pdo->getAttribute(PDO::ATTR_SERVER_VERSION) . " ==\n";
        drop_tables($pdo, $driver);
        try {

        // O banco de hoje (000 a 002): duas instituições, contas e o progresso já gravado da Ana.
        foreach (['000_create_schema_migrations.sql', '001_create_accounts.sql', '002_create_quest_completions.sql'] as $f) {
            foreach (Migrator::statements((string) file_get_contents("{$root}/migrations/{$driver}/{$f}")) as $sql) {
                $pdo->exec($sql);
            }
        }
        $pdo->exec("INSERT INTO tenants (slug) VALUES ('aurora-demo'), ('boreal-demo')");
        $tid = static fn (string $slug): int => (int) $pdo->query("SELECT id FROM tenants WHERE slug = '{$slug}'")->fetchColumn();
        [$aurora, $boreal] = [$tid('aurora-demo'), $tid('boreal-demo')];
        $people = ['ana' => $aurora, 'bia' => $aurora, 'caio' => $aurora, 'davi' => $aurora, 'dora' => $aurora, 'eva' => $boreal];
        $uid = [];
        foreach ($people as $name => $tenant) {
            $pdo->prepare('INSERT INTO users (email) VALUES (?)')->execute(["{$name}@demo.test"]);
            $uid[$name] = (int) $pdo->query("SELECT id FROM users WHERE email = '{$name}@demo.test'")->fetchColumn();
            $pdo->prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)')->execute([$uid[$name], $tenant, $name === 'dora' ? 'tenant_admin' : 'student']);
        }
        $done = $pdo->prepare('INSERT INTO quest_completions (tenant_id, user_id, track_id, quest_id, completed_at) VALUES (?, ?, ?, ?, ?)');
        $done->execute([$aurora, $uid['ana'], 'astro-demo', 'q-telescopio', '2026-10-01 10:00:00']);
        $done->execute([$aurora, $uid['ana'], 'astro-demo', 'q-orbitas', '2026-10-02 10:00:00']);
        $done->execute([$boreal, $uid['eva'], 'escola-demo.clima', 'q-nuvens', '2026-10-03 10:00:00']);

        $migrator = new Migrator($pdo, "{$root}/migrations");
        $applied = $migrator->migrate();
        check($applied === ($driver === 'pgsql' ? ['000', '001', '002', '003', '004', '005'] : ['000', '001', '002', '003', '004']) && $migrator->migrate() === [], 'migrations aplicadas em ordem; rodar de novo não aplica nada');
        foreach (Migrator::statements((string) file_get_contents("{$root}/migrations/{$driver}/004_enroll_existing_progress.sql")) as $sql) {
            $pdo->exec($sql); // o backfill de novo, como no phpMyAdmin
        }

        $ctx = static fn (string $name): TenantContext => new TenantContext($people[$name], $people[$name] === $aurora ? 'aurora-demo' : 'boreal-demo', $uid[$name], $name === 'dora' ? 'tenant_admin' : 'student');
        $svc = static fn (string $name) => spike_enrollment_service($pdo, $ctx($name), $catalog, SALT);
        $rows = static fn (): int => (int) $pdo->query('SELECT COUNT(*) FROM enrollments')->fetchColumn();

        echo "--- ninguém perde o que já fez\n";
        check($svc('ana')->enrolledCourses() === ['astro-demo'] && $rows() === 2, 'quem já tem progresso fica matriculado (a Ana no astro-demo, a Eva no curso dela); o backfill de novo não duplica');
        check($svc('ana')->catalog()[0] === ['courseId' => 'astro-demo', 'method' => 'free', 'status' => 'active', 'cohort' => 'padrao'], 'na turma padrão do curso, criada pela migration');

        echo "--- Gherkin: matrícula livre\n";
        check($svc('bia')->enrolledCourses() === [] && refused(fn () => $svc('bia')->assertEnrolled('astro-demo')) === 'NOT_ENROLLED', 'antes de se matricular, o curso não está no Portal dela e o progresso é recusado (NOT_ENROLLED)');
        check($svc('bia')->enroll('astro-demo', null, '10.0.0.2', $now) === ['status' => 'active', 'cohort' => 'padrao'], 'a Bia se matricula no prédio de Matrículas: ativa na hora');
        check($svc('bia')->enrolledCourses() === ['astro-demo'] && refused(fn () => $svc('bia')->assertEnrolled('astro-demo')) === 'OK', 'e o curso aparece no Portal dos cursos dela; o progresso passa a valer');
        check($svc('bia')->enroll('astro-demo', null, '10.0.0.2', $now)['status'] === 'active' && $rows() === 3, 'pedir de novo é idempotente');

        echo "--- turmas\n";
        $svc('dora')->addCohort('astro-demo', '2026-1', '2026-01-01 00:00:00', '2026-07-01 00:00:00');
        $svc('dora')->addCohort('astro-demo', '2026-2', '2026-07-01 00:00:00', '2027-01-01 00:00:00');
        check($svc('caio')->enroll('astro-demo', null, '10.0.0.3', $now)['cohort'] === '2026-2', 'o Caio entra na turma aberta agora (2026-2), não na encerrada (2026-1)');
        check(refused(fn () => $svc('dora')->addCohort('astro-demo', 'x', '2026-02-01 00:00:00', '2026-01-01 00:00:00')) === 'COHORT_INVALID' && refused(fn () => $svc('caio')->addCohort('astro-demo', 'y', '2026-01-01 00:00:00', null)) === 'FORBIDDEN', 'turma com fim antes do início é recusada; aluno não abre turma');

        echo "--- Gherkin: matrícula com aprovação\n";
        $svc('dora')->setRule('escola-demo.clima', 'approval', null, $now);
        check($svc('bia')->enroll('escola-demo.clima', null, '10.0.0.2', $now) === ['status' => 'pending', 'cohort' => null], 'a Bia pede a matrícula: aguardando aprovação');
        check($svc('bia')->catalog()[1]['status'] === 'pending' && !in_array('escola-demo.clima', $svc('bia')->enrolledCourses(), true) && refused(fn () => $svc('bia')->assertEnrolled('escola-demo.clima')) === 'NOT_ENROLLED', 'ela vê "aguardando aprovação"; o curso não entra no Portal e o progresso é recusado');
        check(refused(fn () => $svc('bia')->pending()) === 'FORBIDDEN' && $svc('dora')->pending() === [['userId' => $uid['bia'], 'courseId' => 'escola-demo.clima', 'requestedAt' => '2026-10-31 12:00:00']], 'só o admin vê os pedidos');
        $svc('dora')->decide($uid['bia'], 'escola-demo.clima', true, $now);
        check(in_array('escola-demo.clima', $svc('bia')->enrolledCourses(), true) && $svc('dora')->pending() === [], 'o admin aprova: o curso entra no Portal dela');
        check(refused(fn () => $svc('dora')->decide($uid['bia'], 'escola-demo.clima', true, $now)) === 'NOT_PENDING', 'aprovar de novo é recusado (NOT_PENDING)');
        $svc('caio')->enroll('escola-demo.clima', null, '10.0.0.3', $now);
        $svc('dora')->decide($uid['caio'], 'escola-demo.clima', false, $now);
        check($svc('caio')->catalog()[1]['status'] === 'rejected' && $svc('caio')->enroll('escola-demo.clima', null, '10.0.0.3', $now)['status'] === 'pending', 'pedido recusado: o aluno vê a recusa e pode pedir de novo');

        echo "--- Gherkin: código errado várias vezes\n";
        $svc('dora')->setRule('escola-demo.lab', 'code', 'LAB-2026-X', $now);
        $stored = (string) $pdo->query("SELECT code_hash FROM course_enrollment_rules WHERE course_id = 'escola-demo.lab'")->fetchColumn();
        check($stored === CodeEnrollment::hash('LAB-2026-X', SALT) && !str_contains($stored, 'LAB'), 'o código de convite fica só como hash');
        $wrong = array_map(fn (int $i) => refused(fn () => $svc('davi')->enroll('escola-demo.lab', "ERRADO-{$i}", '10.0.0.9', $now)), range(1, 5));
        check($wrong === array_fill(0, 5, 'CODE_INVALID'), '5 códigos errados do mesmo IP: CODE_INVALID');
        check(refused(fn () => $svc('davi')->enroll('escola-demo.lab', 'LAB-2026-X', '10.0.0.9', $now)) === 'CODE_RATE_LIMITED', 'depois do limite, até o código certo é recusado por um tempo (CODE_RATE_LIMITED)');
        check($svc('davi')->enroll('escola-demo.lab', 'lab-2026-x', '10.0.0.9', $now->modify('+31 minutes'))['status'] === 'active', 'passada a janela, o código certo matricula');
        check((int) $pdo->query("SELECT COUNT(*) FROM auth_rate_limit WHERE bucket_key LIKE '%10.0.0.9%'")->fetchColumn() === 0, 'o limite usa a tabela da US30, com a chave em hash (nenhum IP em claro)');
        check(refused(fn () => $svc('davi')->setRule('escola-demo.lab', 'free', null, $now)) === 'FORBIDDEN' && refused(fn () => $svc('dora')->setRule('escola-demo.lab', 'code', '123', $now)) === 'RULE_INVALID', 'só o admin muda a regra; código curto demais é recusado');

        echo "--- isolamento entre instituições\n";
        check($svc('eva')->catalog()[1] === ['courseId' => 'escola-demo.clima', 'method' => 'free', 'status' => 'active', 'cohort' => 'padrao'], 'a regra de aprovação da Aurora não vale na Boreal (lá o mesmo id é livre)');
        $borealAdmin = spike_enrollment_service($pdo, new TenantContext($boreal, 'boreal-demo', $uid['eva'], 'tenant_admin'), $catalog, SALT);
        check($borealAdmin->pending() === [] && count($svc('dora')->pending()) === 1, 'o admin da Boreal não vê os pedidos da Aurora (lá há 1 aguardando)');
        check(refused(fn () => $borealAdmin->decide($uid['caio'], 'escola-demo.clima', true, $now)) === 'NOT_PENDING', 'o admin da Boreal não aprova um pedido da Aurora (para ele, o pedido não existe)');
        $leak = true;
        try {
            (new class ($pdo, $ctx('eva')) extends TenantScopedRepository {
                public function all(): array
                {
                    return $this->run('SELECT * FROM enrollments')->fetchAll();
                }
            })->all();
        } catch (LogicException) {
            $leak = false;
        }
        check(!$leak, 'um SQL sem o filtro "tenant_id = :tenant_id" nem chega ao banco');
        $fk = false;
        try {
            $pdo->prepare("INSERT INTO enrollments (tenant_id, user_id, course_id, status, requested_at) VALUES (?, ?, 'astro-demo', 'active', '2026-10-31 12:00:00')")->execute([$boreal, $uid['ana']]);
        } catch (PDOException) {
            $fk = true;
        }
        check($fk, 'o banco recusa matrícula de quem não é membro da instituição (FK para memberships)');
        if ($driver === 'pgsql') {
            // A aplicação usa um papel comum: superusuários (como o do contêiner) ignoram o RLS.
            $pdo->exec("DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spike_app') THEN CREATE ROLE spike_app NOLOGIN; END IF; END \$\$");
            $pdo->exec('GRANT SELECT, INSERT, UPDATE ON enrollments, cohorts, course_enrollment_rules TO spike_app');
            $pdo->exec('SET ROLE spike_app');
            $pdo->exec("SELECT set_config('app.tenant_id', '', false)");
            check((int) $pdo->query('SELECT COUNT(*) FROM enrollments')->fetchColumn() === 0, 'PostgreSQL: sem a instituição informada, o papel da aplicação não vê matrícula nenhuma');
            $pdo->exec("SELECT set_config('app.tenant_id', '{$boreal}', false)");
            $seen = $pdo->query('SELECT DISTINCT tenant_id FROM enrollments')->fetchAll(PDO::FETCH_COLUMN);
            check(array_map('intval', $seen) === [$boreal], 'PostgreSQL: com o RLS, um SELECT sem WHERE só vê as matrículas da Boreal');
            $blocked = false;
            try {
                $pdo->prepare("INSERT INTO enrollments (tenant_id, user_id, course_id, status, requested_at) VALUES (?, ?, 'astro-demo', 'active', '2026-10-31 12:00:00')")->execute([$aurora, $uid['ana']]);
            } catch (PDOException) {
                $blocked = true;
            }
            check($blocked, 'PostgreSQL: com a Boreal informada, gravar uma matrícula da Aurora é barrado pelo banco');
            $pdo->exec('RESET ROLE');
        }

        echo "--- API (envelope do contrato)\n";
        $api = new EnrollmentsApi(static fn (TenantContext $t) => spike_enrollment_service($pdo, $t, $catalog, SALT));
        $call = static fn (string $method, string $route, ?array $body, ?TenantContext $t, string $ip = '10.0.1.1') => $api->handle($method, $route, $body === null ? '' : (string) json_encode($body), $t, $ip, $now);
        check($call('GET', 'catalog', null, null)[0] === 401 && $call('GET', 'nada', null, $ctx('bia'))[0] === 404 && $call('GET', 'enroll', null, $ctx('bia'))[0] === 405 && $call('POST', 'enroll', ['x' => 1], $ctx('bia'))[0] === 400, 'sem sessão 401; rota desconhecida 404; método errado 405; corpo fora do formato 400');
        $pdo->exec("INSERT INTO users (email) VALUES ('fabio@demo.test')");
        $fabio = (int) $pdo->query("SELECT id FROM users WHERE email = 'fabio@demo.test'")->fetchColumn();
        $pdo->prepare("INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, 'student')")->execute([$fabio, $aurora]);
        $f = new TenantContext($aurora, 'aurora-demo', $fabio, 'student');
        check($call('POST', 'enroll', ['courseId' => 'astro-demo'], $f)[0] === 201 && $call('POST', 'enroll', ['courseId' => 'escola-demo.clima'], $f)[0] === 202, 'livre: 201; com aprovação: 202');
        $r = $call('POST', 'enroll', ['courseId' => 'escola-demo.lab', 'code' => 'nao'], $f);
        check($r === [422, ['status' => 'error', 'error' => ['code' => 'CODE_INVALID']]] && $call('POST', 'enroll', ['courseId' => 'outra.coisa'], $f)[0] === 404, 'código errado: 422 CODE_INVALID; curso que a instituição não vê: 404');
        check($call('GET', 'mine', null, $f)[1]['data']['courses'] === ['astro-demo'], 'GET mine: o Portal dos cursos dele (só o matriculado)');
    } finally {
        if ($driver === 'pgsql') {
            $pdo->exec('RESET ROLE');
        }
        drop_tables($pdo, $driver); // passou ou falhou, o banco volta limpo para o próximo spike
    }
}

echo $failed ? "\n❌ Falhou.\n" : "\n✅ Tudo certo ({$total} checks).\n";
exit($failed ? 1 : 0);
