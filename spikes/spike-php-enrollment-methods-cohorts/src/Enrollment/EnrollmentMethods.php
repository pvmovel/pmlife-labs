<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use InvalidArgumentException;

/** O método de um curso pela regra gravada; sem regra, matrícula livre. O único lugar que conhece os métodos. */
final class EnrollmentMethods
{
    public const NAMES = ['free', 'code', 'approval'];

    /** @param array{method: string, code_hash: ?string}|null $rule */
    public static function for(?array $rule, string $salt): EnrollmentMethod
    {
        return match ($rule['method'] ?? 'free') {
            'free' => new FreeEnrollment(),
            'approval' => new ApprovalEnrollment(),
            'code' => new CodeEnrollment((string) ($rule['code_hash'] ?? ''), $salt),
            default => throw new InvalidArgumentException('método de matrícula desconhecido'),
        };
    }
}
