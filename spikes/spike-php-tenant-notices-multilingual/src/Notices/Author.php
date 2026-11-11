<?php
declare(strict_types=1);

namespace Spike\Notices;

/**
 * Quem pede, vindo só da sessão: a instituição, o nome e o papel. No produto, a sessão é o login, e os papéis são os do
 * admin (o master da instituição e o autor de um curso).
 */
final class Author
{
    public const ROLES = ['student', 'master', 'author'];

    /** @param list<string> $courses os cursos de que é autor (só o papel "author") */
    public function __construct(
        public readonly int $tenantId,
        public readonly string $name,
        public readonly string $role,
        public readonly array $courses = [],
    ) {
    }
}
