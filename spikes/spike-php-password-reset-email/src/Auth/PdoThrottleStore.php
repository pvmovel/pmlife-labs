<?php
// (A mesma classe da lib PHP do PMLife, US30.)

declare(strict_types=1);

namespace Spike\Reset\Auth;

use PDO;

/**
 * Contadores na tabela auth_rate_limit (migration 002). O upsert é atômico nos dois dialetos: duas tentativas ao
 * mesmo tempo não se perdem (o que um "SELECT e depois UPDATE" permitiria).
 */
final class PdoThrottleStore implements ThrottleStore
{
    private readonly string $upsert;

    public function __construct(private readonly PDO $pdo)
    {
        $this->upsert = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql'
            ? 'INSERT INTO auth_rate_limit (bucket_key, window_key, hits) VALUES (?, ?, 1)
               ON CONFLICT (bucket_key, window_key) DO UPDATE SET hits = auth_rate_limit.hits + 1'
            : 'INSERT INTO auth_rate_limit (bucket_key, window_key, hits) VALUES (?, ?, 1)
               ON DUPLICATE KEY UPDATE hits = hits + 1';
    }

    public function hit(string $bucket, int $window): int
    {
        $this->pdo->prepare($this->upsert)->execute([$bucket, $window]);
        return $this->count($bucket, [$window]);
    }

    public function count(string $bucket, array $windows): int
    {
        if ($windows === []) {
            return 0;
        }
        $in = implode(',', array_fill(0, count($windows), '?'));
        $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(hits), 0) FROM auth_rate_limit WHERE bucket_key = ? AND window_key IN ($in)");
        $stmt->execute([$bucket, ...$windows]);
        return (int) $stmt->fetchColumn();
    }

    public function clear(string $bucket): void
    {
        $this->pdo->prepare('DELETE FROM auth_rate_limit WHERE bucket_key = ?')->execute([$bucket]);
    }

    /** Para o Cron: apaga janelas antigas (a tabela não cresce sem limite). */
    public function purgeBefore(int $window): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM auth_rate_limit WHERE window_key < ?');
        $stmt->execute([$window]);
        return $stmt->rowCount();
    }
}
