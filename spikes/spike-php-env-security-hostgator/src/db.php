<?php
declare(strict_types=1);

require_once __DIR__ . '/env-loader.php';

/**
 * Responde com o envelope de erro padrão e encerra.
 * Nunca inclui a mensagem interna: ela vai apenas para o log do servidor.
 */
function json_error(string $code, int $httpStatus = 500): void
{
    http_response_code($httpStatus);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'error' => ['code' => $code]]);
    exit;
}

/**
 * Monta o DSN a partir da configuração. O driver vem do env (`DB_DRIVER`), o que
 * deixa uma troca futura de MySQL para PostgreSQL restrita ao arquivo de ambiente.
 *
 * @param array<string, mixed> $config
 */
function build_dsn(array $config): string
{
    $driver = (string) ($config['DB_DRIVER'] ?? 'mysql');
    $host = (string) ($config['DB_HOST'] ?? 'localhost');
    $name = (string) ($config['DB_NAME'] ?? '');

    switch ($driver) {
        case 'mysql':
            return "mysql:host={$host};dbname={$name};charset=utf8mb4";
        case 'pgsql':
            return "pgsql:host={$host};dbname={$name}";
        default:
            throw new RuntimeException('DB_DRIVER_UNSUPPORTED');
    }
}

/**
 * Abre a conexão PDO do ambiente atual. Em qualquer falha registra o detalhe no
 * error_log e responde HTTP 500 genérico com o código DB_UNAVAILABLE.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    try {
        $config = load_env(detect_env($_SERVER['HTTP_HOST'] ?? ''));
        $pdo = new PDO(
            build_dsn($config),
            (string) ($config['DB_USER'] ?? ''),
            (string) ($config['DB_PASS'] ?? ''),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        return $pdo;
    } catch (PDOException | RuntimeException $e) {
        error_log('[db] ' . get_class($e) . ': ' . $e->getMessage());
        json_error('DB_UNAVAILABLE');
    }
}
