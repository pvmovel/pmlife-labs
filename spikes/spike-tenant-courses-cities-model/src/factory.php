<?php
declare(strict_types=1);

// Monta o serviço da sede e dos cursos para uma instituição (o único lugar que instancia os adapters).
require_once __DIR__ . '/bootstrap.php';

use Spike\Courses\Courses\CourseService;
use Spike\Courses\Courses\PdoDocumentRepository;
use Spike\Courses\Courses\PlatformCatalog;
use Spike\Courses\Tenant\TenantContext;

function spike_course_service(PDO $pdo, TenantContext $tenant, ?string $platformDir = null): CourseService
{
    return new CourseService(
        new PdoDocumentRepository($pdo, $tenant),
        new PlatformCatalog($platformDir ?? dirname(__DIR__) . '/platform'),
        $tenant,
    );
}
