<?php
declare(strict_types=1);

// Prova o spike: as regras puras (sempre) e, em cada banco configurado por variáveis de ambiente, as migrations em
// cima do banco de hoje, o SQL do primeiro master, os cenários do Gherkin da US36, os papéis de curso, a auditoria, o
// isolamento entre instituições e, no PostgreSQL, o RLS com dois usuários de banco (app_tenant e app_platform).
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script apaga as tabelas do spike (e, no
// PostgreSQL, os papéis de banco dele) no banco informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';

use Spike\Admin\Access\AdminActor;
use Spike\Admin\Access\AdminPolicy;
use Spike\Admin\Access\AdminSession;
use Spike\Admin\Admin\InstitutionRules;
use Spike\Admin\Db\ConnectionFactory;
use Spike\Admin\Db\Migrator;
use Spike\Admin\Http\AdminSessionState;
use Spike\Admin\Platform\PlatformRepository;
use Spike\Admin\Tenant\TenantScope;
use Spike\Admin\Tenant\TenantScopedRepository;

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

/** true se a chamada lançar a exceção da classe dada. */
function throws(callable $call, string $class): bool
{
    try {
        $call();
        return false;
    } catch (Throwable $e) {
        return $e instanceof $class;
    }
}

echo "== Regras puras ==\n";
$platform = new AdminActor(1, true, null, null);
$admin = new AdminActor(2, false, 10, 'tenant_admin');
$tutor = new AdminActor(3, false, 10, 'tutor');
$author = new AdminActor(4, false, 10, 'student', ['astro-demo' => 'author']);
$courseTutor = new AdminActor(5, false, 10, 'student', ['astro-demo' => 'tutor']);
$student = new AdminActor(6, false, 10, 'student');
check(array_filter(AdminPolicy::ACTIONS, static fn (string $a): bool => !AdminPolicy::can($platform, $a, 99, 'x')) === [], 'o master da plataforma pode tudo, em qualquer instituição');
check(AdminPolicy::can($admin, 'members.manage', 10) && AdminPolicy::can($admin, 'courses.edit', 10, 'qualquer') && !AdminPolicy::can($admin, 'members.view', 11) && !AdminPolicy::can($admin, 'institutions.manage') && !AdminPolicy::can($admin, 'platform.admins'), 'o master da instituição administra tudo da dele, nada de outra, e não cria instituições');
check(AdminPolicy::can($tutor, 'members.view', 10) && AdminPolicy::can($tutor, 'courses.view', 10) && !AdminPolicy::can($tutor, 'members.manage', 10) && !AdminPolicy::can($tutor, 'courses.edit', 10, 'astro-demo'), 'o tutor da instituição acompanha, sem alterar');
check(AdminPolicy::can($author, 'courses.edit', 10, 'astro-demo') && !AdminPolicy::can($author, 'courses.edit', 10, 'outro') && !AdminPolicy::can($author, 'courses.edit', 11, 'astro-demo') && !AdminPolicy::can($author, 'members.view', 10), 'o autor edita só o curso designado, na instituição dele');
check(AdminPolicy::can($courseTutor, 'members.view', 10, 'astro-demo') && !AdminPolicy::can($courseTutor, 'members.view', 10) && !AdminPolicy::can($courseTutor, 'members.view', 10, 'outro'), 'o tutor do curso vê só os alunos desse curso');
check(!AdminPolicy::canEnter($student) && AdminPolicy::sections($student) === [] && !AdminPolicy::canEnter(new AdminActor(7, false, 10, null)), 'o aluno (e um vínculo desativado, sem papel) não entra no admin');
check(
    AdminPolicy::sections($platform) === ['institutions', 'members', 'enrollments', 'courses', 'audit']
    && AdminPolicy::sections($admin) === ['members', 'enrollments', 'courses', 'audit']
    && AdminPolicy::sections($tutor) === ['members', 'courses']
    && AdminPolicy::sections($author) === ['courses']
    && AdminPolicy::sections($courseTutor) === ['members', 'courses'],
    'as seções de cada papel são as da PoC do layout'
);
check(throws(fn () => AdminPolicy::can($admin, 'tudo', 10), InvalidArgumentException::class) && throws(fn () => new AdminActor(1, false, 10, 'dono'), InvalidArgumentException::class) && throws(fn () => new AdminActor(1, false, 10, 'student', ['c' => 'dono']), InvalidArgumentException::class), 'ação ou papel desconhecido é erro de programação, nunca permissão');
$t = 1_800_000_000;
check(AdminSession::fresh($t - 3600, $t - 29 * 60, $t) && !AdminSession::fresh($t - 3600, $t - 31 * 60, $t) && !AdminSession::fresh($t - 4 * 3600 - 60, $t - 60, $t), 'sessão de admin: 30 min sem uso ou 4 h desde a senha (o jogo: 2 h e 12 h)');
check(InstitutionRules::validate('', '', '') === ['name' => 'REQUIRED', 'slug' => 'REQUIRED', 'masterEmail' => 'REQUIRED'] && InstitutionRules::validate(str_repeat('a', 81), 'Aurora!', 'sem-arroba') === ['name' => 'NAME_TOO_LONG', 'slug' => 'SLUG_FORMAT', 'masterEmail' => 'EMAIL_FORMAT'] && InstitutionRules::validate(' Aurora ', 'aurora-norte', 'nora@demo.test') === [], 'formulário da instituição: os mesmos códigos da PoC, conferidos de novo no servidor');

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
const TABLES = ['admin_audit', 'course_staff', 'platform_admins', 'enrollments', 'memberships', 'users', 'tenants', 'schema_migrations'];
const PG_ROLES = ['spike_admin_tenant', 'spike_admin_platform', 'app_tenant', 'app_platform'];

/** Apaga as tabelas (e, no PostgreSQL, os papéis) do spike. O banco do CI é compartilhado pelos spikes. */
function drop_all(PDO $pdo, string $driver): void
{
    if ($driver === 'mysql') {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    }
    foreach (TABLES as $t) {
        $pdo->exec("DROP TABLE IF EXISTS {$t}" . ($driver === 'pgsql' ? ' CASCADE' : ''));
    }
    if ($driver === 'mysql') {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    } else {
        foreach (PG_ROLES as $r) {
            $pdo->exec("DROP ROLE IF EXISTS {$r}");
        }
    }
}

function run_file(PDO $pdo, string $file, array $replace = []): void
{
    foreach (Migrator::statements(strtr((string) file_get_contents($file), $replace)) as $sql) {
        $pdo->exec($sql);
    }
}

$now = new DateTimeImmutable('2026-11-02 12:00:00', new DateTimeZone('UTC'));

foreach ($databases as $driver => $prefix) {
    $config = [
        'DB_DRIVER' => $driver,
        'DB_HOST' => getenv("{$prefix}_HOST"),
        'DB_PORT' => getenv("{$prefix}_PORT"),
        'DB_NAME' => getenv("{$prefix}_DB"),
        'DB_USER' => getenv("{$prefix}_USER"),
        'DB_PASS' => (string) getenv("{$prefix}_PASS"),
    ];
    $pdo = ConnectionFactory::create($config);
    echo "\n== {$driver} " . $pdo->getAttribute(PDO::ATTR_SERVER_VERSION) . " ==\n";
    drop_all($pdo, $driver);
    $tenantPdo = $platformPdo = null;
    try {
        // O banco de hoje (000 e 001): duas instituições, as pessoas e as matrículas.
        run_file($pdo, "{$root}/migrations/{$driver}/000_create_schema_migrations.sql");
        run_file($pdo, "{$root}/migrations/{$driver}/001_create_accounts.sql");
        $pdo->exec("INSERT INTO tenants (slug, name, invite_code, created_at) VALUES ('aurora-demo', 'Aurora Demo', 'AURORA1', '2026-10-01 10:00:00'), ('boreal-demo', 'Boreal Demo', 'BOREAL1', '2026-10-01 10:00:00')");
        $tid = static fn (string $slug): int => (int) $pdo->query("SELECT id FROM tenants WHERE slug = '{$slug}'")->fetchColumn();
        [$aurora, $boreal] = [$tid('aurora-demo'), $tid('boreal-demo')];
        $people = [
            'rita' => ['Rita Nunes', $aurora, 'student'],   // vai virar a master da plataforma pelo SQL de ops/
            'ana' => ['Ana Souza', $aurora, 'tenant_admin'],
            'bruno' => ['Bruno Rocha', $aurora, 'student'], // vai virar autor do astro-demo
            'carla' => ['Carla Campos', $aurora, 'tutor'],
            'davi' => ['Davi Lima', $aurora, 'student'],    // vai virar tutor do astro-demo
            'lucas' => ['Lucas Moura', $aurora, 'student'],
            'lia' => ['Lia Prado', $aurora, 'student'],
            'eva' => ['Eva Torres', $boreal, 'tenant_admin'],
            'fabio' => ['Fabio Reis', $boreal, 'student'],
        ];
        $uid = [];
        foreach ($people as $key => [$name, $tenant, $role]) {
            $pdo->prepare("INSERT INTO users (email, display_name, password_hash, terms_version, terms_accepted_at, created_at) VALUES (?, ?, 'x', '2026-10', '2026-10-01 10:00:00', '2026-10-01 10:00:00')")->execute(["{$key}@demo.test", $name]);
            $uid[$key] = (int) $pdo->query("SELECT id FROM users WHERE email = '{$key}@demo.test'")->fetchColumn();
            $pdo->prepare("INSERT INTO memberships (user_id, tenant_id, role, created_at) VALUES (?, ?, ?, '2026-10-01 10:00:00')")->execute([$uid[$key], $tenant, $role]);
        }
        $enroll = $pdo->prepare("INSERT INTO enrollments (tenant_id, user_id, course_id, status, requested_at) VALUES (?, ?, ?, 'active', '2026-10-02 10:00:00')");
        foreach ([['lucas', 'astro-demo'], ['bruno', 'astro-demo'], ['lia', 'aurora-demo.clima'], ['fabio', 'astro-demo']] as [$who, $course]) {
            $enroll->execute([$people[$who][1], $uid[$who], $course]);
        }

        echo "--- migrations em cima do banco de hoje\n";
        $migrator = new Migrator($pdo, "{$root}/migrations");
        $applied = $migrator->migrate();
        check($applied === ($driver === 'pgsql' ? ['000', '001', '002', '003'] : ['000', '001', '002']) && $migrator->migrate() === [], 'migrations aplicadas em ordem; rodar de novo não aplica nada');
        run_file($pdo, "{$root}/migrations/{$driver}/002_create_admin_roles_audit.sql"); // de novo, como no phpMyAdmin
        if ($driver === 'pgsql') {
            run_file($pdo, "{$root}/migrations/pgsql/003_enable_rls_admin.sql");
        }
        $activeCols = (int) $pdo->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_name IN ('tenants', 'memberships') AND column_name = 'active'" . ($driver === 'mysql' ? ' AND table_schema = DATABASE()' : ''))->fetchColumn();
        check($activeCols === 2, 'a 002 rodada de novo não falha nem duplica coluna (idempotente)');
        check((int) $pdo->query('SELECT COUNT(*) FROM tenants WHERE active = TRUE')->fetchColumn() === 2 && (int) $pdo->query('SELECT COUNT(*) FROM memberships WHERE active = TRUE')->fetchColumn() === count($people), 'as instituições e os vínculos de hoje continuam ativos');

        echo "--- o primeiro master da plataforma (SQL de ops/, no phpMyAdmin)\n";
        $ops = "{$root}/ops/first_platform_admin.sql";
        run_file($pdo, $ops);
        $masters = static fn (): int => (int) $pdo->query('SELECT COUNT(*) FROM platform_admins')->fetchColumn();
        check($masters() === 0, 'com o marcador sem trocar, não entra ninguém');
        run_file($pdo, $ops, ['COLOQUE-O-EMAIL-AQUI' => 'rita@demo.test']);
        run_file($pdo, $ops, ['COLOQUE-O-EMAIL-AQUI' => 'rita@demo.test']);
        $first = $pdo->query('SELECT user_id, created_by FROM platform_admins')->fetch();
        check($masters() === 1 && (int) $first['user_id'] === $uid['rita'] && $first['created_by'] === null, 'com o e-mail, a conta vira master da plataforma; rodar de novo não duplica; created_by vazio marca o SQL');

        // As conexões da aplicação: no MySQL, a mesma; no PostgreSQL, um usuário de banco para cada papel (sem superusuário).
        if ($driver === 'pgsql') {
            $pdo->exec("CREATE ROLE spike_admin_tenant LOGIN PASSWORD 'tenantpw' IN ROLE app_tenant");
            $pdo->exec("CREATE ROLE spike_admin_platform LOGIN PASSWORD 'platformpw' IN ROLE app_platform");
            $tenantPdo = ConnectionFactory::create(['DB_USER' => 'spike_admin_tenant', 'DB_PASS' => 'tenantpw'] + $config);
            $platformPdo = ConnectionFactory::create(['DB_USER' => 'spike_admin_platform', 'DB_PASS' => 'platformpw'] + $config);
        } else {
            $tenantPdo = $platformPdo = $pdo;
        }
        $api = spike_admin_api($tenantPdo, $platformPdo);
        $ts = $now->getTimestamp();
        /** Um pedido ao admin como $who (na instituição da sessão dele). */
        $call = static function (string $method, string $route, array $q = [], ?array $body = null, ?string $who = 'rita', bool $csrf = true, ?array $times = null) use ($api, $now, &$uid, &$people, $ts): array {
            $session = $who === null ? null : new AdminSessionState($uid[$who], $people[$who][1], ...($times ?? [$ts - 600, $ts - 60]));
            return $api->handle($method, $route, $q, $body === null ? '' : (string) json_encode($body), $session, $csrf, $now);
        };
        $code = static fn (array $r): string => $r[1]['error']['code'] ?? 'OK';
        $names = static fn (array $r): array => array_map(static fn (array $m): string => $m['name'], $r[1]['data']['members'] ?? []);

        echo "--- Gherkin: aluno não acessa o admin\n";
        check($call('GET', 'me', [], null, 'lucas')[0] === 403 && $code($call('GET', 'members', [], null, 'lucas')) === 'FORBIDDEN' && $code($call('POST', 'institutions', [], ['name' => 'X', 'slug' => 'xx', 'masterEmail' => 'x@demo.test'], 'lucas')) === 'FORBIDDEN', 'o aluno recebe 403 FORBIDDEN em qualquer rota do admin');
        check($call('GET', 'me', [], null, null)[0] === 401 && $call('GET', 'nada')[0] === 404 && $call('GET', 'staff')[0] === 405, 'sem sessão 401; rota desconhecida 404; método errado 405');
        check($code($call('GET', 'me', [], null, 'ana', true, [$ts - 600, $ts - 31 * 60])) === 'ADMIN_REAUTH' && $code($call('GET', 'me', [], null, 'ana', true, [$ts - 4 * 3600 - 60, $ts - 60])) === 'ADMIN_REAUTH', 'sessão de admin vencida (30 min parada ou 4 h): 401 ADMIN_REAUTH');
        check($code($call('POST', 'member-status', [], ['userId' => $uid['lia'], 'active' => false], 'ana', false)) === 'CSRF_INVALID' && $call('POST', 'staff', [], null, 'ana')[0] === 400, 'POST sem CSRF: 403 CSRF_INVALID; corpo fora do formato: 400');

        echo "--- Gherkin: master da plataforma cria uma instituição\n";
        $me = $call('GET', 'me');
        check($me[0] === 200 && $me[1]['data']['platform'] === true && $me[1]['data']['sections'] === ['institutions', 'members', 'enrollments', 'courses', 'audit'], 'a Rita (master da plataforma) vê todas as seções');
        $created = $call('POST', 'institutions', [], ['name' => ' Aurora Norte ', 'slug' => 'aurora-norte', 'masterEmail' => 'Nora@Demo.test']);
        check($created === [201, ['status' => 'success', 'data' => ['slug' => 'aurora-norte', 'master' => 'created']]], 'ela cria a "Aurora Norte" com o master dela: 201');
        $list = $call('GET', 'institutions', ['q' => 'NORTE']);
        check($list[1]['data']['total'] === 1 && $list[1]['data']['items'][0] === ['slug' => 'aurora-norte', 'name' => 'Aurora Norte', 'active' => true, 'members' => 1, 'createdAt' => '2026-11-02'], 'a Aurora Norte aparece na lista de instituições (a busca ignora maiúsculas)');
        $nora = $pdo->query("SELECT id, password_hash, terms_version FROM users WHERE email = 'nora@demo.test'")->fetch();
        check($nora !== false && $nora['terms_version'] === null && !password_verify('', (string) $nora['password_hash']) && str_starts_with((string) $nora['password_hash'], '$argon2id$'), 'o e-mail sem conta vira uma conta com senha que ninguém conhece (Argon2id) e os termos a aceitar no primeiro acesso');
        $north = $tid('aurora-norte');
        $uid['nora'] = (int) $nora['id'];
        $people['nora'] = ['nora', $north, 'tenant_admin'];
        $noraMe = $call('GET', 'me', [], null, 'nora');
        check($noraMe[0] === 200 && $noraMe[1]['data']['platform'] === false && $noraMe[1]['data']['tenant'] === 'aurora-norte' && $noraMe[1]['data']['sections'] === ['members', 'enrollments', 'courses', 'audit'], 'o master da Aurora Norte recebe o acesso ao admin dela (depois de definir a senha pelo "Esqueci a senha")');
        $noraAudit = $call('GET', 'audit', [], null, 'nora')[1]['data']['entries'];
        check(array_column($noraAudit, 'action') === ['admin.granted', 'institution.created'] && $noraAudit[1]['actor'] === null && $noraAudit[1]['platform'] === true, 'a auditoria dela mostra a criação e o acesso, feitos pela "equipe da plataforma" (sem o nome)');
        $usersBefore = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        check($call('POST', 'institutions', [], ['name' => 'Cosmos', 'slug' => 'cosmos-demo', 'masterEmail' => 'ana@demo.test'])[1]['data']['master'] === 'existing' && (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === $usersBefore && (int) $pdo->query("SELECT COUNT(*) FROM memberships WHERE user_id = {$uid['ana']}")->fetchColumn() === 2, 'e-mail que já tem conta: a mesma conta ganha o vínculo (uma conta por e-mail, várias instituições)');
        $taken = $call('POST', 'institutions', [], ['name' => 'Outra', 'slug' => 'aurora-norte', 'masterEmail' => 'x@demo.test']);
        $invalid = $call('POST', 'institutions', [], ['name' => '', 'slug' => 'Aurora!', 'masterEmail' => 'x']);
        check($taken === [409, ['status' => 'error', 'error' => ['code' => 'SLUG_TAKEN', 'fields' => ['slug' => 'SLUG_TAKEN']]]] && $invalid[0] === 422 && $invalid[1]['error']['fields'] === ['name' => 'REQUIRED', 'slug' => 'SLUG_FORMAT', 'masterEmail' => 'EMAIL_FORMAT'], 'endereço repetido: 409 SLUG_TAKEN; formulário inválido: 422 com o erro de cada campo');
        check($code($call('POST', 'institutions', [], ['name' => 'Y', 'slug' => 'yy', 'masterEmail' => 'y@demo.test'], 'ana')) === 'FORBIDDEN' && $code($call('GET', 'institutions', [], null, 'ana')) === 'FORBIDDEN', 'o master da instituição não cria nem lista instituições');
        $more = $pdo->prepare("INSERT INTO tenants (slug, name, invite_code, created_at) VALUES (?, ?, ?, '2026-10-05 10:00:00')");
        foreach (range(1, 22) as $i) {
            $more->execute([sprintf('escola-%02d', $i), sprintf('Escola %02d', $i), "ESC{$i}"]);
        }
        $all = (int) $pdo->query('SELECT COUNT(*) FROM tenants')->fetchColumn();
        $p2 = $call('GET', 'institutions', ['page' => '2'])[1]['data'];
        $p99 = $call('GET', 'institutions', ['page' => '99'])[1]['data'];
        check($p2['total'] === $all && count($p2['items']) === $all - 20 && $p2['page'] === 2 && $p99['page'] === 2, "paginação de 20 em 20 ({$all} instituições); página além da última volta para a última");
        check($call('GET', 'institutions', ['q' => '%'])[1]['data']['total'] === 0 && $call('GET', 'institutions', ['q' => 'escola_0'])[1]['data']['total'] === 0, '% e _ na busca são texto, não curinga');

        echo "--- Gherkin: master da instituição só vê a própria\n";
        check($names($call('GET', 'members', [], null, 'ana')) === ['Ana Souza', 'Bruno Rocha', 'Carla Campos', 'Davi Lima', 'Lia Prado', 'Lucas Moura', 'Rita Nunes'], 'a Ana (master da Aurora) lista só as pessoas da Aurora');
        check($code($call('GET', 'members', ['tenant' => 'boreal-demo'], null, 'ana')) === 'TENANT_FORBIDDEN' && $code($call('GET', 'audit', ['tenant' => 'boreal-demo'], null, 'ana')) === 'TENANT_FORBIDDEN', 'pedido direto à API pelos dados da Boreal: 403 TENANT_FORBIDDEN');
        check($code($call('POST', 'member-status', [], ['userId' => $uid['fabio'], 'active' => false], 'ana')) === 'MEMBER_NOT_FOUND' && $code($call('POST', 'member-status', [], ['tenant' => 'boreal-demo', 'userId' => $uid['fabio'], 'active' => false], 'ana')) === 'TENANT_FORBIDDEN' && $code($call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['fabio'], 'role' => 'author'], 'ana')) === 'MEMBER_NOT_FOUND', 'desativar ou designar alguém da Boreal pelo id: para a Aurora, a pessoa não existe');
        $boreal4platform = $call('GET', 'members', ['tenant' => 'boreal-demo']);
        check($names($boreal4platform) === ['Eva Torres', 'Fabio Reis'], 'o master da plataforma escolhe a Boreal e vê as pessoas dela');

        echo "--- pessoas: desativar e reativar\n";
        check($call('POST', 'member-status', [], ['userId' => $uid['lia'], 'active' => false], 'ana')[0] === 200 && (int) $pdo->query("SELECT COUNT(*) FROM enrollments WHERE user_id = {$uid['lia']}")->fetchColumn() === 1, 'a Ana desativa a Lia; a matrícula e o progresso dela ficam guardados');
        $auroraAudit = $call('GET', 'audit', [], null, 'ana')[1]['data']['entries'];
        check($auroraAudit[0] === ['at' => '2026-11-02 12:00:00', 'actor' => 'Ana Souza', 'platform' => false, 'action' => 'member.deactivated', 'target' => 'Lia Prado'], 'a auditoria registra quem fez o quê, quando e em quem');
        check($code($call('POST', 'member-status', [], ['userId' => $uid['ana'], 'active' => false], 'ana')) === 'CANNOT_DEACTIVATE_SELF', 'ninguém desativa a si mesmo (409)');
        $carlaMe = $call('GET', 'me', [], null, 'carla');
        check($carlaMe[1]['data']['sections'] === ['members', 'courses'] && $code($call('POST', 'member-status', [], ['userId' => $uid['lucas'], 'active' => false], 'carla')) === 'FORBIDDEN', 'a Carla (tutora da instituição) acompanha as pessoas, mas não desativa');
        $call('POST', 'member-status', [], ['userId' => $uid['carla'], 'active' => false], 'ana');
        $off = $call('GET', 'me', [], null, 'carla')[0];
        $call('POST', 'member-status', [], ['userId' => $uid['carla'], 'active' => true], 'ana');
        check($off === 403 && $call('GET', 'me', [], null, 'carla')[0] === 200, 'vínculo desativado perde o admin no pedido seguinte (o papel é lido do banco), e volta ao reativar');

        echo "--- papéis de curso (autor e tutor)\n";
        check($call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['bruno'], 'role' => 'author'], 'ana')[0] === 200, 'a Ana designa o Bruno autor do astro-demo');
        $brunoMe = $call('GET', 'me', [], null, 'bruno')[1]['data'];
        [$brunoActor] = (new Spike\Admin\Access\ActorResolver($tenantPdo))->resolve($uid['bruno'], $aurora);
        check($brunoMe['sections'] === ['courses'] && (array) $brunoMe['courses'] === ['astro-demo' => 'author'] && AdminPolicy::can($brunoActor, 'courses.edit', $aurora, 'astro-demo') && !AdminPolicy::can($brunoActor, 'courses.edit', $aurora, 'aurora-demo.clima'), 'o Bruno vê só Cursos e edita só o astro-demo');
        $call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['davi'], 'role' => 'tutor'], 'ana');
        check($names($call('GET', 'members', ['course' => 'astro-demo'], null, 'davi')) === ['Bruno Rocha', 'Lucas Moura'], 'o Davi (tutor do astro-demo) vê só os alunos matriculados nele (o Fabio, da Boreal, no mesmo curso, não)');
        check($code($call('GET', 'members', [], null, 'davi')) === 'FORBIDDEN' && $code($call('GET', 'members', ['course' => 'aurora-demo.clima'], null, 'davi')) === 'FORBIDDEN', 'sem o curso, ou com outro curso, o tutor do curso é recusado');
        check($code($call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['bruno'], 'role' => 'dono'], 'ana')) === 'INVALID_REQUEST' && $code($call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['lucas'], 'role' => 'author'], 'carla')) === 'FORBIDDEN', 'papel desconhecido: 400; só quem administra a instituição designa');
        $call('POST', 'staff', [], ['courseId' => 'astro-demo', 'userId' => $uid['bruno'], 'role' => null], 'ana');
        check($call('GET', 'me', [], null, 'bruno')[0] === 403 && array_column($call('GET', 'audit', [], null, 'ana')[1]['data']['entries'], 'action')[0] === 'staff.removed', 'sem o papel de autor, o Bruno volta a ser só aluno (fora do admin); a auditoria registra');

        echo "--- master da plataforma dentro de uma instituição\n";
        check($call('POST', 'member-status', [], ['tenant' => 'boreal-demo', 'userId' => $uid['fabio'], 'active' => false])[0] === 200, 'a Rita desativa o Fabio na Boreal');
        $evaAudit = $call('GET', 'audit', [], null, 'eva')[1]['data']['entries'];
        $evaMembers = $call('GET', 'members', [], null, 'eva')[1]['data']['members'];
        check($evaAudit[0]['action'] === 'member.deactivated' && $evaAudit[0]['platform'] === true && $evaAudit[0]['actor'] === null && $evaMembers[1]['active'] === false, 'a Eva (master da Boreal) vê na auditoria que a equipe da plataforma desativou o Fabio');
        check($call('POST', 'institution-status', [], ['slug' => 'boreal-demo', 'active' => false])[0] === 200 && $call('GET', 'me', [], null, 'eva')[0] === 403 && $call('GET', 'institutions', ['q' => 'boreal'])[1]['data']['items'][0]['active'] === false, 'instituição desativada: o master dela perde o admin; a lista mostra "inativa"');
        $call('POST', 'institution-status', [], ['slug' => 'boreal-demo', 'active' => true]);
        $evaAudit = $call('GET', 'audit', [], null, 'eva')[1]['data']['entries'];
        check(array_slice(array_column($evaAudit, 'action'), 0, 2) === ['institution.reactivated', 'institution.deactivated'], 'reativada, ela volta; as duas ações ficam na auditoria da Boreal');
        check($code($call('POST', 'institution-status', [], ['slug' => 'nao-existe', 'active' => false])) === 'TENANT_NOT_FOUND' && $code($call('GET', 'members', ['tenant' => 'nao-existe'])) === 'TENANT_NOT_FOUND', 'instituição que não existe: 404');

        echo "--- outros masters da plataforma\n";
        check($code($call('POST', 'platform-admins', [], ['email' => 'eva@demo.test'], 'ana')) === 'FORBIDDEN' && $code($call('POST', 'platform-admins', [], ['email' => 'ninguem@demo.test'])) === 'ACCOUNT_NOT_FOUND', 'só o master da plataforma cria outro; e-mail sem conta: 404');
        $call('POST', 'platform-admins', [], ['email' => 'Eva@demo.test']);
        $call('POST', 'platform-admins', [], ['email' => 'eva@demo.test']);
        $eva = $pdo->query("SELECT COUNT(*) AS n, MAX(created_by) AS by_id FROM platform_admins WHERE user_id = {$uid['eva']}")->fetch();
        check((int) $eva['n'] === 1 && (int) $eva['by_id'] === $uid['rita'] && $call('GET', 'me', [], null, 'eva')[1]['data']['platform'] === true, 'a Rita torna a Eva master da plataforma (uma vez só, com quem criou)');
        $platformRows = (int) $pdo->query("SELECT COUNT(*) FROM admin_audit WHERE tenant_id IS NULL AND action = 'platform_admin.added'")->fetchColumn();
        $seenByTenants = array_merge(...array_map(static fn (string $w): array => array_column($call('GET', 'audit', [], null, $w)[1]['data']['entries'], 'action'), ['ana', 'eva', 'nora']));
        check($platformRows === 1 && !in_array('platform_admin.added', $seenByTenants, true), 'a ação da plataforma fica na auditoria da plataforma; nenhuma instituição a vê');

        echo "--- travas no código\n";
        check(throws(fn () => (new class ($tenantPdo, new TenantScope($aurora)) extends TenantScopedRepository {
            public function all(): array
            {
                return $this->run('SELECT * FROM memberships')->fetchAll();
            }
        })->all(), LogicException::class), 'um SQL sem o filtro "tenant_id = :tenant_id" nem chega ao banco');
        check(throws(fn () => new PlatformRepository($platformPdo, false), LogicException::class), 'o repositório da plataforma não nasce para quem não é master da plataforma');

        if ($driver === 'pgsql') {
            echo "--- PostgreSQL: RLS com dois usuários de banco\n";
            $count = static fn (PDO $c, string $sql): int => (int) $c->query($sql)->fetchColumn();
            $tenantPdo->exec("SELECT set_config('app.tenant_id', '', false)");
            check($count($tenantPdo, 'SELECT COUNT(*) FROM memberships') === 0 && $count($tenantPdo, 'SELECT COUNT(*) FROM users') === 0 && $count($tenantPdo, 'SELECT COUNT(*) FROM tenants') === 0, 'app_tenant sem a instituição informada: não vê ninguém');
            $tenantPdo->exec("SELECT set_config('app.tenant_id', '{$aurora}', false)");
            $seen = array_map('intval', $tenantPdo->query('SELECT DISTINCT tenant_id FROM memberships')->fetchAll(PDO::FETCH_COLUMN));
            check($seen === [$aurora] && $count($tenantPdo, 'SELECT COUNT(*) FROM tenants') === 1 && $count($tenantPdo, 'SELECT COUNT(*) FROM users') === 7, 'com a Aurora: um SELECT sem WHERE só vê os vínculos, a instituição e as 7 pessoas da Aurora');
            $tenantPdo->prepare('UPDATE memberships SET active = FALSE WHERE user_id = ?')->execute([$uid['eva']]);
            check($count($pdo, "SELECT COUNT(*) FROM memberships WHERE user_id = {$uid['eva']} AND active = TRUE") === 1, 'um UPDATE de alguém da Boreal, com a Aurora informada, não alcança a linha');
            $denied = static fn (PDO $c, string $sql): bool => throws(fn () => $c->exec($sql), PDOException::class);
            check($denied($tenantPdo, "INSERT INTO admin_audit (tenant_id, created_at, actor_user_id, actor_scope, action, target) VALUES ({$boreal}, NOW(), 1, 'tenant', 'x', 'x')"), 'gravar auditoria na Boreal com a Aurora informada: barrado pelo banco');
            check($denied($tenantPdo, "UPDATE admin_audit SET target = 'x'") && $denied($tenantPdo, 'DELETE FROM admin_audit') && $denied($platformPdo, "UPDATE admin_audit SET target = 'x'") && $denied($platformPdo, 'DELETE FROM admin_audit'), 'auditoria só cresce: nenhum dos dois papéis altera ou apaga uma linha');
            check($denied($tenantPdo, "INSERT INTO platform_admins (user_id, created_at) VALUES ({$uid['ana']}, NOW())") && $denied($tenantPdo, 'UPDATE tenants SET active = FALSE') && $denied($tenantPdo, "INSERT INTO tenants (slug, name, invite_code, created_at) VALUES ('zz', 'zz', 'ZZ', NOW())"), 'app_tenant não cria master da plataforma nem mexe nas instituições');
            check($count($platformPdo, 'SELECT COUNT(*) FROM tenants') === $all && $count($platformPdo, 'SELECT COUNT(DISTINCT tenant_id) FROM memberships') === 4, 'app_platform vê todas as instituições (é a conexão só do repositório da plataforma)');
            check($count($pdo, "SELECT COUNT(*) FROM pg_roles WHERE rolname IN ('spike_admin_tenant', 'spike_admin_platform') AND (rolsuper OR rolbypassrls)") === 0, 'nenhum dos dois usuários é superusuário nem tem BYPASSRLS');
        }
    } finally {
        $tenantPdo = $platformPdo = $api = $call = null; // fecha as conexões dos usuários de banco antes de apagar os papéis
        gc_collect_cycles();
        drop_all($pdo, $driver); // passou ou falhou, o banco volta limpo para o próximo spike
    }
}

echo $failed ? "\n❌ Falhou.\n" : "\n✅ Tudo certo ({$total} checks).\n";
exit($failed ? 1 : 0);
