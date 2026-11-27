<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

use PDO;

/** O registro no MySQL 5.7 ou no PostgreSQL, com o mesmo SQL. */
final class PdoFileRepository implements FileRepository
{
    private const COLUMNS = 'id, tenant_id, course_id, storage_key, mime, size_bytes, sha256, original_name, created_by, created_at';

    /** Falha a próxima gravação (só nos testes: prova que o arquivo e a cota voltam). */
    public bool $failNextInsert = false;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function insert(StoredFile $f): void
    {
        $table = $this->failNextInsert ? 'stored_files_que_nao_existe' : 'stored_files';
        $this->failNextInsert = false;
        $this->pdo->prepare("INSERT INTO {$table} (" . self::COLUMNS . ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$f->id, $f->tenantId, $f->courseId, $f->storageKey, $f->mime, $f->size, $f->sha256,
                $f->originalName, $f->createdBy, $f->createdAt]);
    }

    public function find(int $tenantId, string $id): ?StoredFile
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM stored_files WHERE tenant_id = ? AND id = ?');
        $stmt->execute([$tenantId, $id]);
        $row = $stmt->fetch();
        return $row === false ? null : self::hydrate($row);
    }

    public function listByCourse(int $tenantId, int $courseId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::COLUMNS . ' FROM stored_files WHERE tenant_id = ? AND course_id = ? ORDER BY created_at DESC, id'
        );
        $stmt->execute([$tenantId, $courseId]);
        return array_map([self::class, 'hydrate'], $stmt->fetchAll());
    }

    public function delete(int $tenantId, string $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM stored_files WHERE tenant_id = ? AND id = ?');
        $stmt->execute([$tenantId, $id]);
        return $stmt->rowCount() === 1;
    }

    /** @param array<string, mixed> $r */
    private static function hydrate(array $r): StoredFile
    {
        return new StoredFile(
            trim((string) $r['id']), (int) $r['tenant_id'], (int) $r['course_id'], trim((string) $r['storage_key']),
            (string) $r['mime'], (int) $r['size_bytes'], trim((string) $r['sha256']), (string) $r['original_name'],
            (int) $r['created_by'], substr((string) $r['created_at'], 0, 19),
        );
    }
}
