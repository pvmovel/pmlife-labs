<?php
declare(strict_types=1);

// A conexão, a sessão e o CSRF dos endpoints da demo. O banco vem do arquivo de ambiente do labs, FORA do webroot (a
// técnica de spikes/spike-php-env-security-hostgator); sem ele, das variáveis SPIKE_MYSQL_* (o verify local e o CI).

require_once __DIR__ . '/Quiz/AttemptRules.php';
require_once __DIR__ . '/Quiz/Draw.php';
require_once __DIR__ . '/Quiz/Graders.php';
require_once __DIR__ . '/Quiz/QuizStore.php';
require_once __DIR__ . '/Quiz/QuizService.php';

/** @return array<string, mixed> */
function quiz_env(): array
{
    if (getenv('SPIKE_MYSQL_HOST')) {
        return [
            'DB_HOST' => (string) getenv('SPIKE_MYSQL_HOST'),
            'DB_PORT' => (int) (getenv('SPIKE_MYSQL_PORT') ?: 3306),
            'DB_NAME' => (string) (getenv('SPIKE_MYSQL_DB') ?: 'spike'),
            'DB_USER' => (string) (getenv('SPIKE_MYSQL_USER') ?: 'spike'),
            'DB_PASS' => (string) (getenv('SPIKE_MYSQL_PASS') ?: ''),
        ];
    }
    $dirs = [];
    $home = getenv('HOME');
    if (is_string($home) && $home !== '') {
        $dirs[] = rtrim($home, '/');
    }
    $dir = dirname((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    for ($i = 0; $i < 4 && $dir !== '' && $dir !== '/'; $i++) {
        $dirs[] = $dir;
        $dir = dirname($dir);
    }
    foreach (array_unique($dirs) as $d) {
        if (is_file("{$d}/labs.production.env.php")) {
            $env = require "{$d}/labs.production.env.php";
            if (is_array($env)) {
                return $env;
            }
        }
    }
    throw new RuntimeException('ENV_NOT_FOUND');
}

function quiz_pdo(): PDO
{
    $e = quiz_env();
    return new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $e['DB_HOST'], (int) ($e['DB_PORT'] ?? 3306), $e['DB_NAME']),
        (string) $e['DB_USER'],
        (string) $e['DB_PASS'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
    );
}

/** A sessão da demo (cookie HttpOnly, SameSite=Lax; Secure no HTTPS): o aluno fictício, o XP e o token CSRF. */
function quiz_session(): void
{
    session_name('poc_eq');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => ($_SERVER['HTTPS'] ?? '') === 'on']);
    session_start();
    if (!isset($_SESSION['quiz'])) {
        $_SESSION['quiz'] = ['learner' => bin2hex(random_bytes(8)), 'xp' => 0, 'csrf' => bin2hex(random_bytes(16))];
    }
}

function quiz_json(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** @return array<string, mixed>|null o corpo JSON do POST, ou null se não for um objeto */
function quiz_body(): ?array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || !str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        return null;
    }
    $body = json_decode((string) file_get_contents('php://input'), true);
    return is_array($body) && !array_is_list($body) ? $body : null;
}

/** O POST só vale com o token CSRF da sessão no cabeçalho X-CSRF-Token (como as rotas do produto). */
function quiz_csrf_ok(): bool
{
    $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return $sent !== '' && hash_equals((string) ($_SESSION['quiz']['csrf'] ?? ''), $sent);
}
