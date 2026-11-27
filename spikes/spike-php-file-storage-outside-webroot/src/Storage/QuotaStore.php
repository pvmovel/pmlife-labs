<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** A cota da instituição. reserve() é atômica: dois envios ao mesmo tempo nunca passam juntos do teto. */
interface QuotaStore
{
    public function setQuota(int $tenantId, int $quotaBytes): void;

    /** @return bool false se não cabe (nada muda) */
    public function reserve(int $tenantId, int $bytes): bool;

    public function release(int $tenantId, int $bytes): void;

    /** @return array{used: int, quota: int} */
    public function usage(int $tenantId): array;
}
