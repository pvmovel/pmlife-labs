<?php
declare(strict_types=1);

namespace Spike\TenantDb\Db;

/** Separa um arquivo .sql em comandos (`;` no fim da linha), sem os comentários de linha inteira. */
final class SqlFile
{
    /** @return list<string> */
    public static function statements(string $sql): array
    {
        $lines = array_filter(explode("\n", $sql), static fn (string $l): bool => !str_starts_with(ltrim($l), '--'));
        $out = [];
        foreach (preg_split('/;\s*(?:\n|$)/', implode("\n", $lines)) ?: [] as $part) {
            if (trim($part) !== '') {
                $out[] = trim($part);
            }
        }
        return $out;
    }
}
