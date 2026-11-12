<?php
declare(strict_types=1);

// A conexão e a sessão dos endpoints da demo. O banco vem do arquivo de ambiente do labs, FORA do webroot (a mesma
// técnica de spikes/spike-php-env-security-hostgator); sem ele, das variáveis SPIKE_MYSQL_* (o verify local e o CI).

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Spike\\Badges\\')) {
        require __DIR__ . '/Badges/' . substr($class, strlen('Spike\\Badges\\')) . '.php';
    }
});

/** @return array<string, mixed> */
function badges_env(): array
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

function badges_pdo(): PDO
{
    $e = badges_env();
    return new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $e['DB_HOST'], (int) ($e['DB_PORT'] ?? 3306), $e['DB_NAME']),
        (string) $e['DB_USER'],
        (string) $e['DB_PASS'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
    );
}

/** A sessão PHP de sempre (cookie HttpOnly, SameSite=Lax; Secure no HTTPS). */
function badges_session(bool $write = false): void
{
    session_name('spike_badges');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => ($_SERVER['HTTPS'] ?? '') === 'on']);
    session_start($write ? [] : ['read_and_close' => true]);
}

/** O endereço público desta pasta (public/), para os links do Open Badges. */
function badges_base(): string
{
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $dir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return ($https ? 'https' : 'http') . "://{$host}{$dir}";
}

function badges_json(int $status, array $body, string $type = 'application/json'): void
{
    http_response_code($status);
    header("Content-Type: {$type}; charset=utf-8");
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** @return array<string, mixed>|null o corpo JSON do POST, ou null se não for um objeto */
function badges_body(): ?array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || !str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        return null;
    }
    $body = json_decode((string) file_get_contents('php://input'), true);
    return is_array($body) ? $body : null;
}
