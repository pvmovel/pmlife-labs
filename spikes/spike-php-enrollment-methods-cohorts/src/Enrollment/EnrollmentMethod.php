<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/**
 * Um método de matrícula (como as "enrolment methods" do Moodle). Cada curso tem um; um método novo (ex.: pagamento,
 * fora do escopo pelo custo zero) é outra implementação, sem mexer no serviço (Open/Closed).
 */
interface EnrollmentMethod
{
    /** O nome gravado na regra do curso (free, code, approval). */
    public function name(): string;

    /** Decide um pedido de matrícula. O código, quando há, é o que o aluno digitou. */
    public function decide(?string $code): Decision;
}
