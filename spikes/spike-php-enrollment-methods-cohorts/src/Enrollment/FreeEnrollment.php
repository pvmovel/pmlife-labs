<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/** Matrícula livre: qualquer aluno da instituição entra na hora (o padrão de um curso sem regra). */
final class FreeEnrollment implements EnrollmentMethod
{
    public function name(): string
    {
        return 'free';
    }

    public function decide(?string $code): Decision
    {
        return Decision::active();
    }
}
