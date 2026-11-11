<?php
declare(strict_types=1);

// A conexão e a sessão dos endpoints da demo. O banco vem do arquivo de ambiente do labs, FORA do webroot (a mesma
// técnica de spikes/spike-php-env-security-hostgator); sem ele, das variáveis SPIKE_MYSQL_* (o verify local e o CI).

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Spike\\Notices\\')) {
        require __DIR__ . '/Notices/' . substr($class, strlen('Spike\\Notices\\')) . '.php';
    }
});

/** @return array<string, mixed> */
function notices_env(): array
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

function notices_pdo(): PDO
{
    $e = notices_env();
    return new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $e['DB_HOST'], (int) ($e['DB_PORT'] ?? 3306), $e['DB_NAME']),
        (string) $e['DB_USER'],
        (string) $e['DB_PASS'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
    );
}

/** A sessão PHP de sempre (cookie HttpOnly, SameSite=Lax; Secure no HTTPS), fechada logo depois de usada. */
function notices_session(bool $write = false): void
{
    session_name('spike_notices');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => ($_SERVER['HTTPS'] ?? '') === 'on']);
    session_start($write ? [] : ['read_and_close' => true]);
}

/** @param array<string, string> $headers */
function notices_respond(int $status, ?array $body, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: ' . ($headers['Cache-Control'] ?? 'no-store'));
    unset($headers['Cache-Control']);
    foreach ($headers as $name => $value) {
        header("{$name}: {$value}");
    }
    if ($body !== null) {
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
    }
}

/** @return array<string, mixed>|null o corpo JSON do POST, ou null se não for um objeto */
function notices_body(): ?array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || !str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        return null;
    }
    $body = json_decode((string) file_get_contents('php://input'), true);
    return is_array($body) ? $body : null;
}
