<?php
declare(strict_types=1);

// Prova o spike: regras puras (sempre) e, em cada banco configurado por variáveis de ambiente, os cenários do Gherkin
// da US30, o RLS do PostgreSQL e um ponta a ponta HTTP de verdade (php -S) com o cookie de sessão.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script apaga as tabelas do spike no banco
// informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';
require_once dirname(__DIR__) . '/src/Db/ConnectionFactory.php';
require_once dirname(__DIR__) . '/src/Db/Migrator.php';

use Spike\Auth\Auth\ArraySessionStore;
use Spike\Auth\Auth\Csrf;
use Spike\Auth\Auth\LoginThrottle;
use Spike\Auth\Auth\MemoryThrottleStore;
use Spike\Auth\Auth\NativeSessionStore;
use Spike\Auth\Auth\PasswordPolicy;
use Spike\Auth\Auth\PdoAccountRepository;
use Spike\Auth\Db\ConnectionFactory;
use Spike\Auth\Db\Migrator;
use Spike\Auth\Tenant\ProgressRepository;
use Spike\Auth\Tenant\TenantContext;
use Spike\Auth\Tenant\TenantScopedRepository;

$root = dirname(__DIR__);
$failed = false;

function check(bool $ok, string $label): void
{
    global $failed;
    echo ($ok ? '✅ ' : '❌ ') . $label . "\n";
    if (!$ok) {
        $failed = true;
    }
}

$now = new DateTimeImmutable('2026-10-22T10:00:00Z');
$at = static fn (int $seconds): DateTimeImmutable => $now->modify("+{$seconds} seconds");
const PASS = 'correct horse battery staple';

// ---------------------------------------------------------------- regras puras (sem banco)
echo "--- senha (OWASP ASVS 2.1)\n";
$pw = PasswordPolicy::default();
check(defined('PASSWORD_ARGON2ID') ? str_starts_with($pw->hash(PASS), '$argon2id$') : str_starts_with($pw->hash(PASS), '$2y$'), 'hash com Argon2id (ou bcrypt, se o PHP não tiver Argon2)');
check($pw->verify(PASS, $pw->hash(PASS)) && !$pw->verify('outra senha qualquer', $pw->hash(PASS)), 'verifica a senha certa e recusa a errada');
check($pw->problem('curta123', 'a@b.c') === 'PASSWORD_TOO_SHORT' && $pw->problem(str_repeat('x', 129), 'a@b.c') === 'PASSWORD_TOO_LONG', 'menos de 12 ou mais de 128 caracteres é recusado');
check($pw->problem('Password1234', 'a@b.c') === 'PASSWORD_TOO_COMMON' && $pw->problem('ana@escola.test', 'ana@escola.test') === 'PASSWORD_TOO_COMMON', 'senha comum ou igual ao e-mail é recusada');
check($pw->problem('frase com espaços e ç ✓', 'a@b.c') === null, 'frase com espaços e Unicode é aceita (sem regra de "1 maiúscula")');
check($pw->needsRehash(password_hash(PASS, PASSWORD_BCRYPT, ['cost' => 10])) === defined('PASSWORD_ARGON2ID'), 'hash antigo (bcrypt custo 10) é marcado para rehash');

echo "--- CSRF (ASVS 4.2.2)\n";
$s = new ArraySessionStore();
$csrf = new Csrf($s);
$token = $csrf->token();
check(strlen($token) === 64 && $csrf->token() === $token, 'token de 256 bits, estável na sessão');
check($csrf->valid($token) && !$csrf->valid(null) && !$csrf->valid('') && !$csrf->valid(strrev($token)), 'aceita só o token da sessão (comparação em tempo constante)');
$csrf->rotate();
check(!$csrf->valid($token), 'depois de trocar, o token antigo não vale');

echo "--- limite de tentativas (Gherkin, ASVS 2.2.1)\n";
$t = new LoginThrottle(new MemoryThrottleStore(), 'sal');
for ($i = 0; $i < 4; $i++) {
    $t->loginFailed('ana@aurora.test', '10.0.0.1', $now);
}
check(!$t->loginLocked('ana@aurora.test', '10.0.0.1', $now), '4 erros: ainda pode tentar');
$t->loginFailed('ana@aurora.test', '10.0.0.1', $now);
check($t->loginLocked('ana@aurora.test', '10.0.0.1', $now), 'Gherkin: 5 erros seguidos bloqueiam aquela conta naquele IP');
check(!$t->loginLocked('ana@aurora.test', '10.0.0.2', $now) && !$t->loginLocked('bia@aurora.test', '10.0.0.1', $now), 'de outro IP a conta entra; outra conta no mesmo IP também (sem trancar o aluno fora)');
check($t->loginLocked('ana@aurora.test', '10.0.0.1', $at(LoginThrottle::WINDOW_SECONDS)), 'na janela seguinte o bloqueio continua (conta a janela anterior)');
check(!$t->loginLocked('ana@aurora.test', '10.0.0.1', $at(2 * LoginThrottle::WINDOW_SECONDS)), 'duas janelas depois (até 30 min), o bloqueio cai sozinho');
$t2 = new LoginThrottle(new MemoryThrottleStore(), 'sal');
$edge = new DateTimeImmutable('@' . (intdiv($now->getTimestamp(), 900) * 900 + 899));
for ($i = 0; $i < 3; $i++) {
    $t2->loginFailed('caio@aurora.test', '10.0.0.3', $edge);
}
for ($i = 0; $i < 2; $i++) {
    $t2->loginFailed('caio@aurora.test', '10.0.0.3', $edge->modify('+2 seconds'));
}
check($t2->loginLocked('caio@aurora.test', '10.0.0.3', $edge->modify('+2 seconds')), '3 erros no fim de uma janela + 2 no começo da seguinte também bloqueiam');
$t3 = new LoginThrottle(new MemoryThrottleStore(), 'sal');
for ($i = 0; $i < 20; $i++) {
    $t3->loginFailed("conta{$i}@aurora.test", '10.0.0.9', $now);
}
check($t3->loginLocked('nova@aurora.test', '10.0.0.9', $now), '20 erros do mesmo IP em contas diferentes bloqueiam o IP (senhas comuns em muitas contas)');
$t->loginSucceeded('ana@aurora.test', '10.0.0.1');
check(!$t->loginLocked('ana@aurora.test', '10.0.0.1', $now), 'login certo zera o contador daquela conta naquele IP');
check($t->retryAfter($now) > LoginThrottle::WINDOW_SECONDS && $t->retryAfter($now) <= 2 * LoginThrottle::WINDOW_SECONDS, 'Retry-After entre 15 e 30 min');

echo "--- tenant\n";
$threw = false;
try {
    new TenantContext(1, 1, 'superuser');
} catch (InvalidArgumentException) {
    $threw = true;
}
check($threw, 'papel fora da lista (student, tenant_admin) é recusado');

// ---------------------------------------------------------------- bancos
$targets = [];
foreach (['mysql' => 'MySQL', 'pgsql' => 'PostgreSQL'] as $driver => $label) {
    $prefix = 'SPIKE_' . strtoupper($driver) . '_';
    if (getenv($prefix . 'HOST') === false) {
        continue;
    }
    $targets[$label] = [
        'DB_DRIVER' => $driver,
        'DB_HOST' => getenv($prefix . 'HOST'),
        'DB_PORT' => (int) getenv($prefix . 'PORT'),
        'DB_NAME' => getenv($prefix . 'DB'),
        'DB_USER' => getenv($prefix . 'USER'),
        'DB_PASS' => (string) getenv($prefix . 'PASS'),
    ];
}
if ($targets === []) {
    if (getenv('CI') !== false) {
        echo "❌ Nenhum banco configurado no CI (SPIKE_MYSQL_* / SPIKE_PGSQL_*)\n";
        exit(1);
    }
    echo "⚠️  Nenhum banco configurado: defina SPIKE_MYSQL_* e/ou SPIKE_PGSQL_* (veja o README). Pulando a parte com banco.\n";
    exit($failed ? 1 : 0);
}

function reset_db(PDO $pdo): void
{
    foreach (['progress_events', 'memberships', 'users', 'tenants', 'auth_rate_limit', 'schema_migrations'] as $table) {
        $pdo->exec("DROP TABLE IF EXISTS {$table}");
    }
}

/** Um navegador: a própria sessão, um IP e o token CSRF que o GET /api/me entrega. */
final class Client
{
    public ArraySessionStore $session;
    private string $csrf = '';

    public function __construct(private PDO $pdo, public string $ip, private DateTimeImmutable $now)
    {
        $this->session = new ArraySessionStore();
    }

    public function at(DateTimeImmutable $now): self
    {
        $this->now = $now;
        return $this;
    }

    public function get(string $route): array
    {
        [$status, $body] = build_auth_api($this->pdo, $this->session)->handle('GET', $route, [], '', $this->ip, $this->now);
        $this->csrf = $body['data']['csrfToken'] ?? $this->csrf;
        return [$status, $body];
    }

    public function post(string $route, array $data, ?string $csrf = null, string $type = 'application/json'): array
    {
        if ($this->csrf === '') {
            $this->get('me');
        }
        $headers = ['Content-Type' => $type, 'X-CSRF-Token' => $csrf ?? $this->csrf];
        $r = build_auth_api($this->pdo, $this->session)->handle('POST', $route, $headers, json_encode($data), $this->ip, $this->now);
        $this->csrf = $r[1]['data']['csrfToken'] ?? $this->csrf;
        return $r;
    }
}

$signup = static fn (string $email, string $invite, string $name = 'Aluno Teste') => ['inviteCode' => $invite, 'email' => $email, 'password' => PASS, 'displayName' => $name, 'acceptTerms' => true];
$code = static fn (array $r): string => $r[1]['error']['code'] ?? 'OK';

foreach ($targets as $label => $config) {
    echo "=== {$label}\n";
    $pdo = ConnectionFactory::create($config);
    reset_db($pdo);
    $migrator = new Migrator($pdo, $root . '/migrations');
    $first = $migrator->migrate();
    check($first !== [] && $migrator->migrate() === [], "migrations aplicadas (" . implode(', ', $first) . ") e a 2ª execução não faz nada");
    $seed = $pdo->prepare('INSERT INTO tenants (slug, name, invite_code, created_at) VALUES (?, ?, ?, ?)');
    $seed->execute(['aurora', 'Escola Aurora (fictícia)', 'AURORA-2026', '2026-10-01 00:00:00']);
    $seed->execute(['horizonte', 'Colégio Horizonte (fictício)', 'HORIZ-2026', '2026-10-01 00:00:00']);

    echo "--- Gherkin: cadastro e login\n";
    $ana = new Client($pdo, '10.1.0.1', $now);
    check($ana->get('me')[1]['data']['authenticated'] === false, 'visitante: /api/me responde "não conectado" e entrega o token CSRF');
    $r = $ana->post('register', $signup('ana@aurora.test', 'aurora-2026', 'Ana'));
    check($r[0] === 201 && $r[1]['data']['tenant']['slug'] === 'aurora', 'cadastro com o código de convite (sem diferenciar maiúsculas) entra no tenant da instituição');
    $me = $ana->get('me')[1]['data'];
    check($me['authenticated'] === true && $me['tenant']['name'] === 'Escola Aurora (fictícia)' && $me['role'] === 'student', 'Gherkin: o campus mostra que ela está conectada à instituição dela');
    $hash = $pdo->query("SELECT password_hash, terms_version FROM users WHERE email = 'ana@aurora.test'")->fetch(PDO::FETCH_ASSOC);
    check(!str_contains($hash['password_hash'], PASS) && $hash['terms_version'] === '2026-10', 'a senha só existe como hash; o aceite dos termos fica registrado com a versão');
    $ana->post('logout', []);
    check($ana->get('me')[1]['data']['authenticated'] === false, 'logout encerra a sessão');
    $r = $ana->post('login', ['email' => 'ANA@aurora.test', 'password' => PASS]);
    check($r[0] === 200 && $r[1]['data']['tenant']['slug'] === 'aurora', 'login por e-mail (sem diferenciar maiúsculas) e senha volta ao tenant');

    echo "--- cadastro: validações\n";
    $x = new Client($pdo, '10.1.0.2', $now);
    check($code($x->post('register', $signup('novo@aurora.test', 'NAO-EXISTE'))) === 'INVALID_INVITE', 'código de convite inexistente: 400 INVALID_INVITE');
    check($code($x->post('register', ['acceptTerms' => false] + $signup('novo@aurora.test', 'AURORA-2026'))) === 'TERMS_REQUIRED', 'sem aceitar os termos: 400 TERMS_REQUIRED');
    check($code($x->post('register', ['password' => 'curta'] + $signup('novo@aurora.test', 'AURORA-2026'))) === 'PASSWORD_TOO_SHORT', 'senha curta: 400 PASSWORD_TOO_SHORT');
    check($code($x->post('register', $signup('ana@aurora.test', 'HORIZ-2026'))) === 'EMAIL_IN_USE', 'e-mail já cadastrado: 409 EMAIL_IN_USE');
    check($code($x->post('register', $signup('não é e-mail', 'AURORA-2026'))) === 'INVALID_REQUEST', 'e-mail inválido: 400 INVALID_REQUEST');
    check($x->get('me')[1]['data']['authenticated'] === false && (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn() === 1, 'nenhuma dessas tentativas criou conta nem sessão');

    echo "--- CSRF e tipo do conteúdo\n";
    $c = new Client($pdo, '10.1.0.3', $now);
    $c->get('me');
    check($code($c->post('login', ['email' => 'ana@aurora.test', 'password' => PASS], 'token-forjado')) === 'CSRF_INVALID', 'POST com token CSRF errado: 403 (inclusive o login, contra "login CSRF")');
    check($code($c->post('login', ['email' => 'ana@aurora.test', 'password' => PASS], null, 'application/x-www-form-urlencoded')) === 'UNSUPPORTED_MEDIA_TYPE', 'POST de formulário (o que outro site consegue mandar): 415');
    $sid = $c->session->id;
    $c->post('login', ['email' => 'ana@aurora.test', 'password' => PASS]);
    check($c->session->id !== $sid, 'o login troca o ID da sessão (contra fixação de sessão)');

    echo "--- Gherkin: tentativas de login limitadas\n";
    $bad = new Client($pdo, '10.1.0.4', $now);
    $codes = [];
    for ($i = 0; $i < 5; $i++) {
        $codes[] = $code($bad->post('login', ['email' => 'ana@aurora.test', 'password' => 'senha errada demais']));
    }
    check($codes === array_fill(0, 5, 'INVALID_CREDENTIALS'), '5 senhas erradas: 401 INVALID_CREDENTIALS');
    $r = $bad->post('login', ['email' => 'ana@aurora.test', 'password' => PASS]);
    check($r[0] === 429 && $code($r) === 'LOGIN_LOCKED' && (int) ($r[2]['Retry-After'] ?? 0) > 0, 'Gherkin: a 6ª tentativa é bloqueada (429 + Retry-After) mesmo com a senha certa');
    check($code((new Client($pdo, '10.1.0.5', $now))->post('login', ['email' => 'ana@aurora.test', 'password' => PASS])) === 'OK', 'a mesma conta entra de outro IP');
    check($code($bad->at($at(1800))->post('login', ['email' => 'ana@aurora.test', 'password' => PASS])) === 'OK', 'depois de 30 min, entra de novo do mesmo IP');
    $ghost = new Client($pdo, '10.1.0.6', $now);
    check($code($ghost->post('login', ['email' => 'ninguem@aurora.test', 'password' => PASS])) === 'INVALID_CREDENTIALS', 'e-mail sem conta recebe a mesma resposta de senha errada (sem enumeração)');
    $keys = $pdo->query('SELECT bucket_key FROM auth_rate_limit')->fetchAll(PDO::FETCH_COLUMN);
    check($keys !== [] && !array_filter($keys, static fn (string $k): bool => str_contains($k, '@') || str_contains($k, '10.1.')), 'a tabela de tentativas guarda só hashes: nenhum e-mail nem IP em claro');

    echo "--- Gherkin: isolamento entre clientes\n";
    $bruno = new Client($pdo, '10.2.0.1', $now);
    $bruno->post('register', $signup('bruno@horizonte.test', 'HORIZ-2026', 'Bruno'));
    $anaP = new Client($pdo, '10.1.0.7', $now);
    $anaP->post('login', ['email' => 'ana@aurora.test', 'password' => PASS]);
    $idA = $anaP->post('progress', ['questId' => 'erp-clientes', 'xp' => 120])[1]['data']['id'];
    $bruno->post('progress', ['questId' => 'obra-rice', 'xp' => 40]);
    $listB = $bruno->get('progress')[1]['data']['events'];
    check(count($listB) === 1 && $listB[0]['questId'] === 'obra-rice', 'Gherkin: o aluno do tenant B só recebe o próprio progresso');
    check(count($anaP->get('progress')[1]['data']['events']) === 1, 'e a aluna do tenant A, só o dela');
    $anaCtx = new TenantContext(1, 1, 'student');
    $brunoCtx = new TenantContext(2, 2, 'student');
    check((new ProgressRepository($pdo, $brunoCtx))->find($idA) === null && (new ProgressRepository($pdo, $anaCtx))->find($idA) !== null, 'adivinhar o ID de um registro de outro cliente devolve nada');
    $bruno->post('progress', ['questId' => 'obra-rice', 'xp' => 10, 'tenantId' => 1]);
    $aurora = (int) $pdo->query("SELECT COUNT(*) FROM progress_events WHERE tenant_id = 1")->fetchColumn();
    check($aurora === 1, 'um "tenantId" forjado no corpo é ignorado: o registro vai para o tenant da sessão');
    check($code((new Client($pdo, '10.9.0.1', $now))->get('progress')) === 'UNAUTHENTICATED', 'visitante não lê progresso de ninguém: 401');

    $guard = new class ($pdo, $anaCtx) extends TenantScopedRepository {
        public function leak(): array
        {
            return $this->run('SELECT * FROM progress_events')->fetchAll();
        }
        public function override(): array
        {
            return $this->run('SELECT * FROM progress_events WHERE tenant_id = :tenant_id', ['tenant_id' => 2])->fetchAll();
        }
    };
    foreach (['leak' => 'um SQL sem o filtro de tenant é recusado antes de ir ao banco', 'override' => 'passar outro tenant_id ao repositório é recusado'] as $method => $msg) {
        $refused = false;
        try {
            $guard->$method();
        } catch (LogicException) {
            $refused = true;
        }
        check($refused, $msg);
    }
    (new PdoAccountRepository($pdo))->addMembership(1, 2, 'tenant_admin', $now);
    $admin = new TenantContext(2, 1, 'tenant_admin');
    check((new ProgressRepository($pdo, $admin))->tenantSummary() === ['xp' => 50, 'students' => 1], 'o admin do tenant B vê o resumo só do B (50 XP, 1 aluno), sem o XP da Aurora');
    $denied = false;
    try {
        (new ProgressRepository($pdo, $brunoCtx))->tenantSummary();
    } catch (DomainException) {
        $denied = true;
    }
    check($denied, 'aluno comum não vê o resumo do cliente');
    $multi = new Client($pdo, '10.1.0.8', $now);
    $r = $multi->post('login', ['email' => 'ana@aurora.test', 'password' => PASS]);
    check($code($r) === 'TENANT_REQUIRED' && count($r[1]['error']['tenants']) === 2, 'conta de 2 clientes: o login pede qual (409 TENANT_REQUIRED, com a lista)');
    $r = $multi->post('login', ['email' => 'ana@aurora.test', 'password' => PASS, 'tenant' => 'horizonte']);
    check($r[0] === 200 && $r[1]['data']['role'] === 'tenant_admin', 'com "tenant", entra naquele cliente, com o papel dela lá');

    echo "--- sessão (ASVS 3.3)\n";
    $s = new Client($pdo, '10.1.0.9', $now);
    $s->post('login', ['email' => 'bruno@horizonte.test', 'password' => PASS]);
    check($s->at($at(3600))->get('me')[1]['data']['authenticated'] === true, 'usada há 1 h: continua conectado (e o relógio de inatividade recomeça)');
    check($s->at($at(3600 + 7201))->get('me')[1]['data']['authenticated'] === false, '2 h sem uso: a sessão expira');
    $s->at($now)->post('login', ['email' => 'bruno@horizonte.test', 'password' => PASS]);
    foreach ([1, 2, 3, 4, 5, 6] as $h) {
        $s->at($at($h * 3600))->get('me');
    }
    check($s->at($at(12 * 3600 + 1))->get('me')[1]['data']['authenticated'] === false, 'mesmo em uso, 12 h depois do login a sessão expira');

    echo "--- rehash transparente\n";
    (new PdoAccountRepository($pdo))->updateHash(2, password_hash(PASS, PASSWORD_BCRYPT, ['cost' => 10]));
    (new Client($pdo, '10.2.0.2', $now))->post('login', ['email' => 'bruno@horizonte.test', 'password' => PASS]);
    $h = (string) $pdo->query('SELECT password_hash FROM users WHERE id = 2')->fetchColumn();
    check(defined('PASSWORD_ARGON2ID') ? str_starts_with($h, '$argon2id$') : str_starts_with($h, '$2y$12$'), 'um hash antigo é refeito com o algoritmo atual no próximo login');

    if ($config['DB_DRIVER'] === 'pgsql') {
        echo "--- PostgreSQL: Row Level Security (segunda barreira)\n";
        $pdo->exec("DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spike_app') THEN CREATE ROLE spike_app NOLOGIN; END IF; END \$\$");
        $pdo->exec('GRANT SELECT, INSERT ON progress_events TO spike_app');
        $pdo->exec('GRANT USAGE ON SEQUENCE progress_events_id_seq TO spike_app');
        $app = ConnectionFactory::create($config);
        $app->exec('SET ROLE spike_app'); // a aplicação usa um papel comum: superusuários ignoram o RLS
        check((int) $app->query('SELECT COUNT(*) FROM progress_events')->fetchColumn() === 0, 'sem app.tenant_id, um SELECT sem WHERE não vê linha nenhuma');
        new ProgressRepository($app, $anaCtx); // informa o tenant da sessão ao banco
        $rows = $app->query('SELECT DISTINCT tenant_id FROM progress_events')->fetchAll(PDO::FETCH_COLUMN);
        check($rows === [1] || $rows === ['1'], 'com o tenant A informado, até um SELECT sem WHERE só vê linhas do A');
        $blocked = false;
        try {
            $app->prepare("INSERT INTO progress_events (tenant_id, user_id, quest_id, xp, created_at) VALUES (2, 2, 'x', 1, '2026-10-22 10:00:00')")->execute();
        } catch (PDOException) {
            $blocked = true;
        }
        check($blocked, 'gravar uma linha para o tenant B com a sessão do A é recusado pelo banco (WITH CHECK)');
    }
}

// ---------------------------------------------------------------- ponta a ponta HTTP
$label = array_key_first($targets);
$config = $targets[$label];
echo "=== HTTP de verdade (php -S, {$label})\n";
$sock = stream_socket_server('tcp://127.0.0.1:0');
$port = (int) substr(strrchr(stream_socket_get_name($sock, false), ':'), 1);
fclose($sock);
$env = ['SPIKE_DB_DRIVER' => $config['DB_DRIVER'], 'SPIKE_DB_HOST' => $config['DB_HOST'], 'SPIKE_DB_PORT' => (string) $config['DB_PORT'], 'SPIKE_DB_NAME' => $config['DB_NAME'], 'SPIKE_DB_USER' => $config['DB_USER'], 'SPIKE_DB_PASS' => $config['DB_PASS']];
$server = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', $root . '/http'], [['pipe', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']], $pipes, null, $env + getenv());
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100_000);
}

/** @return array{0: int, 1: array, 2: list<string>} status, corpo e linhas Set-Cookie */
$http = static function (string $method, string $path, ?string $cookie = null, ?array $json = null, ?string $csrf = null) use ($port): array {
    $headers = ['Accept: application/json'];
    if ($cookie !== null) {
        $headers[] = "Cookie: {$cookie}";
    }
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'X-CSRF-Token: ' . ($csrf ?? '');
    }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $json === null ? '' : json_encode($json), 'ignore_errors' => true, 'timeout' => 10]]);
    $body = (string) @file_get_contents("http://127.0.0.1:{$port}/api/{$path}.php", false, $ctx);
    $lines = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $lines[0] ?? '', $m);
    $cookies = array_values(array_filter($lines, static fn (string $l): bool => stripos($l, 'Set-Cookie:') === 0));
    $noStore = (bool) array_filter($lines, static fn (string $l): bool => stripos($l, 'Cache-Control: no-store') === 0);
    return [(int) ($m[1] ?? 0), (array) json_decode($body, true), $cookies, $noStore];
};
$sid = static function (array $setCookies): ?string {
    foreach ($setCookies as $line) {
        if (preg_match('/' . preg_quote(NativeSessionStore::COOKIE, '/') . '=([^;]+)/', $line, $m) && $m[1] !== 'deleted' && $m[1] !== '') {
            return $m[1];
        }
    }
    return null;
};

try {
    [$st, $body, $cookies, $noStore] = $http('GET', 'me');
    $cookie = $cookies[0] ?? '';
    check($st === 200 && $body['data']['authenticated'] === false && $noStore, 'GET /api/me de visitante: 200, "não conectado" e Cache-Control: no-store');
    check(str_contains($cookie, NativeSessionStore::COOKIE . '=') && stripos($cookie, 'HttpOnly') !== false && stripos($cookie, 'Secure') !== false && stripos($cookie, 'SameSite=Lax') !== false && stripos($cookie, 'path=/') !== false && stripos($cookie, 'domain=') === false, 'cookie da sessão: __Host-, HttpOnly, Secure, SameSite=Lax, Path=/ e sem Domain');
    $anon = $sid($cookies);
    $csrf = $body['data']['csrfToken'];
    [$st] = $http('POST', 'login', NativeSessionStore::COOKIE . "={$anon}", ['email' => 'bruno@horizonte.test', 'password' => PASS], 'errado');
    check($st === 403, 'POST sem o token CSRF certo: 403');
    [$st, , $cookies] = $http('POST', 'login', NativeSessionStore::COOKIE . "={$anon}", ['email' => 'bruno@horizonte.test', 'password' => PASS], $csrf);
    $auth = $sid($cookies);
    check($st === 200 && $auth !== null && $auth !== $anon, 'login: 200 e um ID de sessão novo no cookie');
    [, $body] = $http('GET', 'me', NativeSessionStore::COOKIE . "={$anon}");
    check(($body['data']['authenticated'] ?? null) === false, 'o ID de antes do login não dá acesso (fixação de sessão)');
    [, $body] = $http('GET', 'me', NativeSessionStore::COOKIE . "={$auth}");
    check(($body['data']['tenant']['slug'] ?? null) === 'horizonte', 'com o ID novo, o /api/me mostra o tenant do aluno');
    $authCsrf = $body['data']['csrfToken'] ?? '';
    $forged = 'idinventadopeloatacante1234567890abcdefghijklmn';
    [$st, $body, $cookies] = $http('GET', 'me', NativeSessionStore::COOKIE . "={$forged}");
    $issued = $sid($cookies);
    check($st === 200 && $body['data']['authenticated'] === false && $issued !== null && $issued !== $forged, 'um ID inventado pelo cliente é trocado por outro gerado no servidor (modo estrito) e vira visitante');
    [$st, , $cookies] = $http('POST', 'logout', NativeSessionStore::COOKIE . "={$auth}", [], $authCsrf);
    [, $after] = $http('GET', 'me', NativeSessionStore::COOKIE . "={$auth}");
    check($st === 200 && ($after['data']['authenticated'] ?? null) === false, 'logout: o mesmo ID deixa de valer no servidor');
} finally {
    proc_terminate($server);
    proc_close($server);
}

exit($failed ? 1 : 0);
