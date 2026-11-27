<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

use PDO;
use PDOException;

/**
 * A reserva é um UPDATE só, com a condição no WHERE: o banco trava a linha, e o segundo envio enxerga o uso já
 * somado. Funciona igual no MySQL 5.7 (InnoDB) e no PostgreSQL, sem SELECT ... FOR UPDATE nem transação longa.
 * Sem linha na tabela, a cota é zero (nada cabe): a instituição nova recebe a linha ao ser criada.
 */
final class PdoQuotaStore implements QuotaStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function setQuota(int $tenantId, int $quotaBytes): void
    {
        $update = $this->pdo->prepare('UPDATE file_quota SET quota_bytes = ? WHERE tenant_id = ?');
        $update->execute([$quotaBytes, $tenantId]);
        if ($update->rowCount() > 0 || $this->exists($tenantId)) {
            return;
        }
        try {
            $this->pdo->prepare('INSERT INTO file_quota (tenant_id, quota_bytes, used_bytes) VALUES (?, ?, 0)')
                ->execute([$tenantId, $quotaBytes]);
        } catch (PDOException) {
            // outro processo criou a linha ao mesmo tempo: basta gravar o teto
            $update->execute([$quotaBytes, $tenantId]);
        }
    }

    public function reserve(int $tenantId, int $bytes): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE file_quota SET used_bytes = used_bytes + ? WHERE tenant_id = ? AND used_bytes + ? <= quota_bytes'
        );
        $stmt->execute([$bytes, $tenantId, $bytes]);
        return $stmt->rowCount() === 1;
    }

    public function release(int $tenantId, int $bytes): void
    {
        $this->pdo->prepare(
            'UPDATE file_quota SET used_bytes = CASE WHEN used_bytes >= ? THEN used_bytes - ? ELSE 0 END WHERE tenant_id = ?'
        )->execute([$bytes, $bytes, $tenantId]);
    }

    public function usage(int $tenantId): array
    {
        $stmt = $this->pdo->prepare('SELECT used_bytes, quota_bytes FROM file_quota WHERE tenant_id = ?');
        $stmt->execute([$tenantId]);
        $row = $stmt->fetch();
        return $row === false ? ['used' => 0, 'quota' => 0]
            : ['used' => (int) $row['used_bytes'], 'quota' => (int) $row['quota_bytes']];
    }

    private function exists(int $tenantId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM file_quota WHERE tenant_id = ?');
        $stmt->execute([$tenantId]);
        return $stmt->fetchColumn() !== false;
    }
}
