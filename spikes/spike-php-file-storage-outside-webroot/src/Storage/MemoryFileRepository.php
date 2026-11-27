<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** O mesmo registro em memória, para os testes sem banco. */
final class MemoryFileRepository implements FileRepository
{
    /** @var array<string, StoredFile> */
    private array $files = [];
    public bool $failNextInsert = false;

    public function insert(StoredFile $file): void
    {
        if ($this->failNextInsert) {
            $this->failNextInsert = false;
            throw new \RuntimeException('DB_WRITE_FAILED');
        }
        $this->files[$file->id] = $file;
    }

    public function find(int $tenantId, string $id): ?StoredFile
    {
        $file = $this->files[$id] ?? null;
        return $file !== null && $file->tenantId === $tenantId ? $file : null;
    }

    public function listByCourse(int $tenantId, int $courseId): array
    {
        $out = array_values(array_filter(
            $this->files,
            static fn (StoredFile $f): bool => $f->tenantId === $tenantId && $f->courseId === $courseId
        ));
        usort($out, static fn (StoredFile $a, StoredFile $b): int => strcmp($b->createdAt, $a->createdAt));
        return $out;
    }

    public function delete(int $tenantId, string $id): bool
    {
        if ($this->find($tenantId, $id) === null) {
            return false;
        }
        unset($this->files[$id]);
        return true;
    }
}
