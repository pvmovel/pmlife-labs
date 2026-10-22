<?php
declare(strict_types=1);

// Controller fino de todos os endpoints: monta a API com a sessão nativa e o banco do env e responde em JSON.
// No spike o banco vem de SPIKE_DB_* (o verify sobe o php -S com essas variáveis); no PMLife, do env fora do webroot.
// O IP é o REMOTE_ADDR; atrás do Cloudflare, o PMLife usa o client_ip() que já confia só no CF-Connecting-IP.

require_once dirname(__DIR__, 2) . '/src/factory.php';
require_once dirname(__DIR__, 2) . '/src/Db/ConnectionFactory.php';

use Spike\Auth\Auth\NativeSessionStore;
use Spike\Auth\Db\ConnectionFactory;

function respond(string $route): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    try {
        $pdo = ConnectionFactory::create([
            'DB_DRIVER' => getenv('SPIKE_DB_DRIVER') ?: 'mysql',
            'DB_HOST' => getenv('SPIKE_DB_HOST') ?: '127.0.0.1',
            'DB_PORT' => (int) getenv('SPIKE_DB_PORT'),
            'DB_NAME' => getenv('SPIKE_DB_NAME') ?: '',
            'DB_USER' => getenv('SPIKE_DB_USER') ?: '',
            'DB_PASS' => (string) getenv('SPIKE_DB_PASS'),
        ]);
        $headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
        [$status, $body, $extra] = build_auth_api($pdo, new NativeSessionStore(), (string) (getenv('SPIKE_SALT') ?: 'spike-salt'))
            ->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', $route, $headers, (string) file_get_contents('php://input'), (string) ($_SERVER['REMOTE_ADDR'] ?? ''), new DateTimeImmutable()) + [2 => []];
        foreach ($extra as $name => $value) {
            header("{$name}: {$value}");
        }
    } catch (Throwable $e) {
        error_log('[auth] ' . get_class($e) . ': ' . $e->getMessage());
        [$status, $body] = [500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]];
    }
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
}
