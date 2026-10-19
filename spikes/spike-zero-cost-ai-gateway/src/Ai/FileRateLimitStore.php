<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Contadores num arquivo JSON fora do webroot, com flock (demo ao vivo do labs, sem banco novo).
 * O produto usa o PdoRateLimitStore (tabela MySQL), com o mesmo contrato.
 */
final class FileRateLimitStore implements RateLimitStore
{
    public function __construct(private string $file)
    {
    }

    public function hit(string $key, string $window): int
    {
        return $this->withLock(function (array &$data) use ($key, $window): int {
            $id = $window . '|' . $key;
            $data[$id] = ($data[$id] ?? 0) + 1;
            return $data[$id];
        });
    }

    public function purgeBefore(string $date): int
    {
        return $this->withLock(function (array &$data) use ($date): int {
            $before = count($data);
            $data = array_filter($data, static fn (string $id): bool => strcmp(substr($id, 2, 10), $date) >= 0, ARRAY_FILTER_USE_KEY);
            return $before - count($data);
        });
    }

    /** @param callable(array<string,int>&): int $fn */
    private function withLock(callable $fn): int
    {
        $dir = dirname($this->file);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('RATE_LIMIT_STORE');
        }
        $fh = fopen($this->file, 'c+');
        if ($fh === false || !flock($fh, LOCK_EX)) {
            throw new \RuntimeException('RATE_LIMIT_STORE');
        }
        try {
            $raw = stream_get_contents($fh);
            $data = is_string($raw) && $raw !== '' ? (json_decode($raw, true) ?: []) : [];
            $result = $fn($data);
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($data));
            fflush($fh);
            return $result;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
