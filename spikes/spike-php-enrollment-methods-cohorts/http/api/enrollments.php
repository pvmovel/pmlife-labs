<?php
declare(strict_types=1);

// Endpoint de demonstração da matrícula. SÓ PARA O SPIKE: a sessão vem do cabeçalho X-Spike-Session
// ("tenantId:tenantSlug:userId:papel") e os cursos visíveis são fixos. Na aplicação real a sessão vem do cookie no
// servidor (spike-php-session-auth-multitenant) e os cursos, do CourseService (spike-tenant-courses-cities-model).
// No labs, este arquivo responde 403 (.htaccess): a prova é o verify.
require_once dirname(__DIR__, 2) . '/src/factory.php';

use Spike\Enrollment\Db\ConnectionFactory;
use Spike\Enrollment\Enrollment\CourseCatalog;
use Spike\Enrollment\Http\EnrollmentsApi;
use Spike\Enrollment\Tenant\TenantContext;

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
$catalog = new class () implements CourseCatalog {
    public function courseIds(): array
    {
        return ['astro-demo', 'escola-demo.clima'];
    }
};
[$status, $body] = (new EnrollmentsApi(static fn (TenantContext $t) => spike_enrollment_service($pdo, $t, $catalog, (string) getenv('SPIKE_ENROLL_SALT'))))
    ->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', (string) ($_GET['route'] ?? ''), (string) file_get_contents('php://input'), $tenant, (string) ($_SERVER['REMOTE_ADDR'] ?? ''), new DateTimeImmutable('now', new DateTimeZone('UTC')));
http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
