<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** A mesma regra em memória, para os testes sem banco. */
final class MemoryQuotaStore implements QuotaStore
{
    /** @var array<int, array{used: int, quota: int}> */
    private array $rows = [];

    public function setQuota(int $tenantId, int $quotaBytes): void
    {
        $this->rows[$tenantId] = ['used' => $this->rows[$tenantId]['used'] ?? 0, 'quota' => $quotaBytes];
    }

    public function reserve(int $tenantId, int $bytes): bool
    {
        $row = $this->usage($tenantId);
        if ($row['used'] + $bytes > $row['quota']) {
            return false;
        }
        $this->rows[$tenantId]['used'] = $row['used'] + $bytes;
        return true;
    }

    public function release(int $tenantId, int $bytes): void
    {
        if (isset($this->rows[$tenantId])) {
            $this->rows[$tenantId]['used'] = max(0, $this->rows[$tenantId]['used'] - $bytes);
        }
    }

    public function usage(int $tenantId): array
    {
        return $this->rows[$tenantId] ?? ['used' => 0, 'quota' => 0];
    }
}
