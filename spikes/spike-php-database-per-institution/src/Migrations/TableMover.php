<?php
declare(strict_types=1);

namespace Spike\TenantDb\Migrations;

use PDO;
use RuntimeException;
use Spike\TenantDb\Tenant\TenantDatabase;

/**
 * A Etapa B: as linhas de uma instituição numa tabela de hoje com `tenant_id` (aqui, `progress_events`) mudam para o
 * banco dela, e voltam se for preciso. Tudo numa transação só (o InnoDB faz a transação valer nos dois bancos do mesmo
 * servidor, na mesma conexão):
 * 1. copia com `INSERT … SELECT`, mantendo o id (repetir não duplica);
 * 2. confere a contagem e uma soma de verificação dos dois lados;
 * 3. só então apaga as linhas da origem. Se a conferência falhar, nada muda.
 */
final class TableMover
{
    /** As colunas em comum (a origem tem também `tenant_id`). */
    private const COLUMNS = 'id, user_id, course_id, quest_id, xp, created_at';
    private const CHECKSUM = "COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|', id, user_id, course_id, quest_id, xp, created_at))), 0) AS crc";

    public function __construct(private readonly PDO $pdo, private readonly string $platformDatabase)
    {
    }

    /** @return array{moved: int, checksum: string} */
    public function moveOut(TenantDatabase $db): array
    {
        $source = "`{$this->platformDatabase}`.`progress_events`";
        $target = $db->table('progress_events');
        return $this->inTransaction(function () use ($db, $source, $target): array {
            $before = $this->sum("SELECT " . self::CHECKSUM . " FROM {$source} WHERE tenant_id = ?", [$db->tenantId]);
            $copy = $this->pdo->prepare('INSERT INTO ' . $target . ' (' . self::COLUMNS . ') SELECT ' . self::COLUMNS . " FROM {$source} WHERE tenant_id = ? ON DUPLICATE KEY UPDATE id = VALUES(id)");
            $copy->execute([$db->tenantId]);
            $ids = $this->pdo->prepare("SELECT id FROM {$source} WHERE tenant_id = ?");
            $ids->execute([$db->tenantId]);
            $after = $this->sumOfIds($target, array_map('intval', $ids->fetchAll(PDO::FETCH_COLUMN)));
            if ($after !== $before) {
                throw new RuntimeException("CHECKSUM_MISMATCH {$before['n']}/{$after['n']}");
            }
            $del = $this->pdo->prepare("DELETE FROM {$source} WHERE tenant_id = ?");
            $del->execute([$db->tenantId]);
            return ['moved' => (int) $before['n'], 'checksum' => (string) $before['crc']];
        });
    }

    /** A volta: as linhas do banco da instituição retornam à tabela de origem, com o `tenant_id`. */
    public function moveBack(TenantDatabase $db): array
    {
        $source = $db->table('progress_events');
        $target = "`{$this->platformDatabase}`.`progress_events`";
        return $this->inTransaction(function () use ($db, $source, $target): array {
            $before = $this->sum("SELECT " . self::CHECKSUM . " FROM {$source}", []);
            $copy = $this->pdo->prepare("INSERT INTO {$target} (tenant_id, " . self::COLUMNS . ') SELECT ?, ' . self::COLUMNS . " FROM {$source} ON DUPLICATE KEY UPDATE id = VALUES(id)");
            $copy->execute([$db->tenantId]);
            $after = $this->sum("SELECT " . self::CHECKSUM . " FROM {$target} WHERE tenant_id = ?", [$db->tenantId]);
            if ($after !== $before) {
                throw new RuntimeException("CHECKSUM_MISMATCH {$before['n']}/{$after['n']}");
            }
            $this->pdo->exec("DELETE FROM {$source}");
            return ['moved' => (int) $before['n'], 'checksum' => (string) $before['crc']];
        });
    }

    /** A soma de verificação de um conjunto de linhas. */
    public function checksumOf(string $table, ?int $tenantId = null): array
    {
        return $tenantId === null ? $this->sum("SELECT " . self::CHECKSUM . " FROM {$table}", []) : $this->sum("SELECT " . self::CHECKSUM . " FROM {$table} WHERE tenant_id = ?", [$tenantId]);
    }

    /** @return array{n: string, crc: string} */
    private function sum(string $sql, array $params): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return ['n' => (string) $row['n'], 'crc' => (string) $row['crc']];
    }

    /** @param list<int> $ids @return array{n: string, crc: string} */
    private function sumOfIds(string $table, array $ids): array
    {
        if ($ids === []) {
            return ['n' => '0', 'crc' => '0'];
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        return $this->sum("SELECT " . self::CHECKSUM . " FROM {$table} WHERE id IN ({$marks})", $ids);
    }

    private function inTransaction(callable $work): array
    {
        $this->pdo->beginTransaction();
        try {
            $out = $work();
            $this->pdo->commit();
            return $out;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
