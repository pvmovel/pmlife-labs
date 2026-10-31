<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/** Matrícula com aprovação: o pedido fica aguardando o admin da instituição. */
final class ApprovalEnrollment implements EnrollmentMethod
{
    public function name(): string
    {
        return 'approval';
    }

    public function decide(?string $code): Decision
    {
        return Decision::pending();
    }
}
