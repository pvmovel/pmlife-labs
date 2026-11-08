<?php
declare(strict_types=1);

namespace Spike\TenantDb\Tenant;

use PDO;

/**
 * O progresso no banco da instituição, pela conexão única (tabelas qualificadas). Sem `tenant_id`: o banco já é da
 * instituição.
 */
final class ProgressRepository
{
    public function __construct(private readonly PDO $pdo, private readonly TenantDatabase $db)
    {
    }

    public function complete(int $userId, string $courseId, string $questId, int $xp, string $now): void
    {
        $st = $this->pdo->prepare("INSERT INTO {$this->db->table('progress_events')} (user_id, course_id, quest_id, xp, created_at) VALUES (?, ?, ?, ?, ?)");
        $st->execute([$userId, $courseId, $questId, $xp, $now]);
    }

    public function xpOf(int $userId, string $courseId): int
    {
        $st = $this->pdo->prepare("SELECT COALESCE(SUM(xp), 0) FROM {$this->db->table('progress_events')} WHERE user_id = ? AND course_id = ?");
        $st->execute([$userId, $courseId]);
        return (int) $st->fetchColumn();
    }
}
