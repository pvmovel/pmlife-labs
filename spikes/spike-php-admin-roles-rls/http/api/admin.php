<?php
declare(strict_types=1);

// Endpoint de demonstração do admin. SÓ PARA O SPIKE: a sessão vem do cabeçalho X-Spike-Session
// ("userId:tenantId:adminAuthAt:adminSeenAt") e o CSRF, do cabeçalho X-Spike-Csrf. Na aplicação real a sessão vem do
// cookie no servidor e o CSRF é o da US30 (spike-php-session-auth-multitenant). No labs, este arquivo responde 403
// (.htaccess): a prova é o verify.
require_once dirname(__DIR__, 2) . '/src/factory.php';

use Spike\Admin\Db\ConnectionFactory;
use Spike\Admin\Http\AdminSessionState;

$connect = static fn (string $prefix): PDO => ConnectionFactory::create([
    'DB_DRIVER' => getenv('SPIKE_DB_DRIVER'),
    'DB_HOST' => getenv('SPIKE_DB_HOST'),
    'DB_PORT' => getenv('SPIKE_DB_PORT'),
    'DB_NAME' => getenv('SPIKE_DB_NAME'),
    'DB_USER' => getenv("{$prefix}_USER"),
    'DB_PASS' => (string) getenv("{$prefix}_PASS"),
]);
$tenantPdo = $connect('SPIKE_DB_TENANT');
$platformPdo = getenv('SPIKE_DB_PLATFORM_USER') ? $connect('SPIKE_DB_PLATFORM') : $tenantPdo;

$session = null;
if (preg_match('/^(\d+):(\d+):(\d+):(\d+)$/', (string) ($_SERVER['HTTP_X_SPIKE_SESSION'] ?? ''), $m) === 1) {
    $session = new AdminSessionState((int) $m[1], (int) $m[2], (int) $m[3], (int) $m[4]);
}
$csrfOk = hash_equals((string) getenv('SPIKE_CSRF'), (string) ($_SERVER['HTTP_X_SPIKE_CSRF'] ?? ''));
[$status, $body] = spike_admin_api($tenantPdo, $platformPdo)->handle(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    (string) ($_GET['route'] ?? ''),
    $_GET,
    (string) file_get_contents('php://input'),
    $session,
    $csrfOk && getenv('SPIKE_CSRF') !== false,
    new DateTimeImmutable('now', new DateTimeZone('UTC')),
);
http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
