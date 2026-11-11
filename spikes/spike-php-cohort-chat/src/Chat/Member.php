<?php
declare(strict_types=1);

namespace Spike\Chat;

/**
 * Quem pede, vindo só da sessão: a pessoa, a instituição, a turma e o papel. No produto, a sessão é o login, e a turma
 * é a da matrícula (o master escolhe a turma que acompanha, como na presença da US41).
 */
final class Member
{
    public const ROLES = ['student', 'master'];

    public function __construct(
        public readonly int $id,
        public readonly int $tenantId,
        public readonly string $cohort,
        public readonly string $name,
        public readonly string $role,
    ) {
    }

    public function isMaster(): bool
    {
        return $this->role === 'master';
    }
}
