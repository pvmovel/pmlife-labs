<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/** Contadores em memória (testes sem banco). */
final class MemoryThrottleStore implements ThrottleStore
{
    /** @var array<string, array<int, int>> */
    private array $hits = [];

    public function hit(string $bucket, int $window): int
    {
        return $this->hits[$bucket][$window] = ($this->hits[$bucket][$window] ?? 0) + 1;
    }

    public function count(string $bucket, array $windows): int
    {
        return array_sum(array_map(fn (int $w): int => $this->hits[$bucket][$w] ?? 0, $windows));
    }

    public function clear(string $bucket): void
    {
        unset($this->hits[$bucket]);
    }
}
