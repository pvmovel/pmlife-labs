<?php
declare(strict_types=1);

// Monta o serviço de matrícula para uma instituição (o único lugar que instancia os adapters).
require_once __DIR__ . '/bootstrap.php';

use Spike\Enrollment\Enrollment\CodeThrottle;
use Spike\Enrollment\Enrollment\CourseCatalog;
use Spike\Enrollment\Enrollment\EnrollmentService;
use Spike\Enrollment\Enrollment\PdoEnrollmentRepository;
use Spike\Enrollment\Tenant\TenantContext;

function spike_enrollment_service(PDO $pdo, TenantContext $tenant, CourseCatalog $courses, string $salt): EnrollmentService
{
    return new EnrollmentService(new PdoEnrollmentRepository($pdo, $tenant), $courses, new CodeThrottle($pdo, $salt), $tenant, $salt);
}
