<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/**
 * Quem pede, como a sessão do PMLife entrega (US30/US36): a instituição, a conta, se gerencia o curso (admin da
 * instituição ou master da plataforma) e os cursos em que está matriculado.
 */
final class Viewer
{
    /** @param list<int> $enrolledCourses */
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly bool $canManage,
        public readonly array $enrolledCourses = [],
    ) {
    }

    public function canRead(StoredFile $file): bool
    {
        return $file->tenantId === $this->tenantId
            && ($this->canManage || in_array($file->courseId, $this->enrolledCourses, true));
    }
}
