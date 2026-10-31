<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/**
 * Matrícula por código de convite. O código nunca é guardado: a regra tem só o HMAC-SHA256 dele com o sal do servidor
 * (o mesmo cuidado do código de recuperação de senha, US39). Maiúsculas e espaços nas pontas não importam.
 */
final class CodeEnrollment implements EnrollmentMethod
{
    public function __construct(private readonly string $codeHash, private readonly string $salt)
    {
    }

    public static function hash(string $code, string $salt): string
    {
        return hash_hmac('sha256', strtoupper(trim($code)), $salt);
    }

    public function name(): string
    {
        return 'code';
    }

    public function decide(?string $code): Decision
    {
        if ($code === null || trim($code) === '') {
            return Decision::refused('CODE_REQUIRED');
        }
        return hash_equals($this->codeHash, self::hash($code, $this->salt)) ? Decision::active() : Decision::refused('CODE_INVALID');
    }
}
