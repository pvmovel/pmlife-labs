<?php
declare(strict_types=1);

// Processo filho do verify: publica N versões seguidas do mesmo curso, em paralelo com outro filho, para provar que
// a trava do documento (SELECT ... FOR UPDATE) nunca repete nem pula uma versão. Uso:
//   php publish-worker.php <driver> <tenantId> <tenantSlug> <slug> <quantas> <marca>
// O banco vem das mesmas variáveis SPIKE_<DRIVER>_* do verify.

require_once dirname(__DIR__) . '/src/factory.php';
require_once __DIR__ . '/migrate-legacy.php';

use Spike\Courses\Content\Json;
use Spike\Courses\Db\ConnectionFactory;
use Spike\Courses\Tenant\TenantContext;

[, $driver, $tenantId, $tenantSlug, $slug, $count, $mark] = $argv;
$prefix = 'SPIKE_' . strtoupper($driver) . '_';
$pdo = ConnectionFactory::create([
    'DB_DRIVER' => $driver,
    'DB_HOST' => getenv($prefix . 'HOST'),
    'DB_PORT' => (int) getenv($prefix . 'PORT'),
    'DB_NAME' => getenv($prefix . 'DB'),
    'DB_USER' => getenv($prefix . 'USER'),
    'DB_PASS' => (string) getenv($prefix . 'PASS'),
]);
$service = spike_course_service($pdo, new TenantContext((int) $tenantId, $tenantSlug, 1, 'tenant_admin'));
$doc = spike_migrate_legacy(dirname(__DIR__) . '/legacy/campus-demo');
$doc['courseId'] = "{$tenantSlug}.{$slug}";
$versions = [];
for ($i = 1; $i <= (int) $count; $i++) {
    $doc['texts']['pt-BR']['course.title'] = "Versão {$mark}-{$i}";
    $doc['texts']['en-US']['course.title'] = "Version {$mark}-{$i}";
    $versions[] = $service->publish('course', $slug, Json::encodeArray($doc), new DateTimeImmutable())['version'];
}
echo json_encode($versions);
