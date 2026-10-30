<?php
declare(strict_types=1);

// Endpoint de demonstração da sede e dos cursos (php -S no verify). SÓ PARA O SPIKE: a sessão vem do cabeçalho
// X-Spike-Session ("tenantId:tenantSlug:userId:papel"). Na aplicação real ela vem do cookie de sessão no servidor
// (spike-php-session-auth-multitenant) e o cliente nunca escolhe a instituição.
require_once dirname(__DIR__, 2) . '/src/factory.php';

use Spike\Courses\Db\ConnectionFactory;
use Spike\Courses\Http\CoursesApi;
use Spike\Courses\Tenant\TenantContext;

$pdo = ConnectionFactory::create([
    'DB_DRIVER' => getenv('SPIKE_DB_DRIVER'),
    'DB_HOST' => getenv('SPIKE_DB_HOST'),
    'DB_PORT' => getenv('SPIKE_DB_PORT'),
    'DB_NAME' => getenv('SPIKE_DB_NAME'),
    'DB_USER' => getenv('SPIKE_DB_USER'),
    'DB_PASS' => (string) getenv('SPIKE_DB_PASS'),
]);
$tenant = null;
if (preg_match('/^(\d+):([a-z][a-z0-9-]{1,19}):(\d+):(student|tenant_admin)$/', (string) ($_SERVER['HTTP_X_SPIKE_SESSION'] ?? ''), $m) === 1) {
    $tenant = new TenantContext((int) $m[1], $m[2], (int) $m[3], $m[4]);
}
$headers = ['if-none-match' => (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')];

[$status, $body, $extra] = (new CoursesApi(static fn (TenantContext $t) => spike_course_service($pdo, $t)))
    ->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', (string) ($_GET['route'] ?? ''), $_GET, (string) file_get_contents('php://input'), $tenant, $headers, new DateTimeImmutable('now', new DateTimeZone('UTC')));

http_response_code($status);
header('X-Content-Type-Options: nosniff');
foreach ($extra as $name => $value) {
    header("{$name}: {$value}");
}
if ($status !== 304) {
    header('Content-Type: application/json; charset=UTF-8');
    echo $body;
}
