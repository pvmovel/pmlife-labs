<?php
declare(strict_types=1);

namespace Spike\Notices;

use PDO;

/** A tabela dos avisos, sempre com a instituição de quem pede no filtro (no produto, o banco já é o da instituição). */
final class NoticeStore
{
    public const LIST_LIMIT = 50;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> os avisos do lugar: os fixados primeiro, depois os mais novos */
    public function list(int $tenantId, string $place): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, title_pt, body_pt, title_en, body_en, pinned, author, published_at, updated_at FROM spike_notices
              WHERE tenant_id = ? AND place = ? ORDER BY pinned DESC, published_at DESC, id DESC LIMIT ' . self::LIST_LIMIT
        );
        $stmt->execute([$tenantId, $place]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @param array{place: string, title_pt: string, body_pt: string, title_en: ?string, body_en: ?string, pinned: bool} $n */
    public function create(int $tenantId, array $n, string $author): int
    {
        $this->pdo->prepare(
            'INSERT INTO spike_notices (tenant_id, place, title_pt, body_pt, title_en, body_en, pinned, author, published_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(3))'
        )->execute([$tenantId, $n['place'], $n['title_pt'], $n['body_pt'], $n['title_en'], $n['body_en'], $n['pinned'] ? 1 : 0, $author]);
        return (int) $this->pdo->lastInsertId();
    }

    /** A correção: só o aviso da mesma instituição e do mesmo lugar (o lugar não muda numa correção). */
    public function update(int $tenantId, int $id, array $n): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE spike_notices SET title_pt = ?, body_pt = ?, title_en = ?, body_en = ?, pinned = ?, updated_at = UTC_TIMESTAMP(3)
              WHERE id = ? AND tenant_id = ? AND place = ?'
        );
        $stmt->execute([$n['title_pt'], $n['body_pt'], $n['title_en'], $n['body_en'], $n['pinned'] ? 1 : 0, $id, $tenantId, $n['place']]);
        return $stmt->rowCount() === 1;
    }

    public function delete(int $tenantId, int $id, string $place): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM spike_notices WHERE id = ? AND tenant_id = ? AND place = ?');
        $stmt->execute([$id, $tenantId, $place]);
        return $stmt->rowCount() === 1;
    }

    /** A limpeza da demo: os avisos fictícios de mais de 1 dia somem. */
    public function purge(int $olderThanSeconds): void
    {
        $this->pdo->prepare('DELETE FROM spike_notices WHERE updated_at < (UTC_TIMESTAMP(3) - INTERVAL ? SECOND)')->execute([$olderThanSeconds]);
    }
}
