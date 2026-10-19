<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Contadores numa tabela (migrations/mysql/001_create_ai_rate_limit.sql). É o store do produto:
 * um INSERT ... ON DUPLICATE KEY UPDATE atômico, que funciona no MySQL 5.7 (HostGator) e no 8.x.
 */
final class PdoRateLimitStore implements RateLimitStore
{
    public function __construct(private \PDO $pdo)
    {
    }

    public function hit(string $key, string $window): int
    {
        $this->pdo->prepare(
            'INSERT INTO ai_rate_limit (bucket_key, window_key, hits) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1'
        )->execute([$key, $window]);
        $stmt = $this->pdo->prepare('SELECT hits FROM ai_rate_limit WHERE bucket_key = ? AND window_key = ?');
        $stmt->execute([$key, $window]);
        return (int) $stmt->fetchColumn();
    }

    public function purgeBefore(string $date): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM ai_rate_limit WHERE SUBSTRING(window_key, 3, 10) < ?');
        $stmt->execute([$date]);
        return $stmt->rowCount();
    }
}
