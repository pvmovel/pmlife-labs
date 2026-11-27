<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** Um arquivo registrado. O id é o que o navegador vê; a storageKey é o nome no disco e nunca sai do servidor. */
final class StoredFile
{
    public function __construct(
        public readonly string $id,
        public readonly int $tenantId,
        public readonly int $courseId,
        public readonly string $storageKey,
        public readonly string $mime,
        public readonly int $size,
        public readonly string $sha256,
        public readonly string $originalName,
        public readonly int $createdBy,
        public readonly string $createdAt,
    ) {
    }

    /** @return array<string, int|string> o que a API devolve (sem a storageKey nem o tenant) */
    public function toPublic(): array
    {
        return [
            'id' => $this->id, 'courseId' => $this->courseId, 'mime' => $this->mime, 'size' => $this->size,
            'name' => $this->originalName, 'createdAt' => $this->createdAt,
        ];
    }
}
