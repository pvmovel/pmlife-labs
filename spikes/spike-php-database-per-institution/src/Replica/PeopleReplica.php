<?php
declare(strict_types=1);

namespace Spike\TenantDb\Replica;

use PDO;
use Spike\TenantDb\Tenant\TenantDatabase;

/**
 * A réplica do cadastro no banco da instituição, com o mesmo id da plataforma. A plataforma guarda só o necessário
 * para entrar (e-mail, hash da senha, termos e vínculos); a instituição guarda o nome de exibição, o papel e se a
 * pessoa é da equipe (o master da plataforma também ganha a dele). Sem chave estrangeira entre os bancos (decisão do
 * Pablo): cada banco fica independente para backup e exportação, e o {@see check()} confere a integridade.
 */
final class PeopleReplica
{
    public function __construct(private readonly PDO $pdo, private readonly string $platformDatabase)
    {
    }

    /** Cria ou atualiza a réplica (no cadastro, no vínculo, na matrícula de equipe e no login). */
    public function upsert(TenantDatabase $db, int $userId, string $displayName, string $role, bool $staff, string $now): void
    {
        $st = $this->pdo->prepare(
            "INSERT INTO {$db->table('people')} (id, display_name, role, staff, updated_at) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = VALUES(role), staff = VALUES(staff), updated_at = VALUES(updated_at)"
        );
        $st->execute([$userId, $displayName, $role, $staff ? 1 : 0, $now]);
    }

    /**
     * Copia para o banco da instituição todas as pessoas com vínculo nela (o backfill da primeira vez, e o conferidor
     * do Cron). Um só comando, entre os dois bancos, na mesma conexão.
     *
     * @return int quantas pessoas a instituição tem na réplica depois
     */
    public function backfill(TenantDatabase $db, string $now): int
    {
        $p = static fn (string $t): string => "`{$t}`";
        $platform = $p($this->platformDatabase);
        $st = $this->pdo->prepare(
            "INSERT INTO {$db->table('people')} (id, display_name, role, staff, updated_at)
             SELECT u.id, u.display_name, m.role, 0, ? FROM {$platform}.`users` u JOIN {$platform}.`memberships` m ON m.user_id = u.id
             WHERE m.tenant_id = ?
             ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = VALUES(role)"
        );
        $st->execute([$now, $db->tenantId]);
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$db->table('people')}")->fetchColumn();
    }

    /**
     * A integridade sem FK: quem tem vínculo na plataforma e falta na réplica, e quem está na réplica sem existir na
     * plataforma.
     *
     * @return array{missing: list<int>, orphans: list<int>}
     */
    public function check(TenantDatabase $db): array
    {
        $platform = "`{$this->platformDatabase}`";
        $missing = $this->pdo->prepare(
            "SELECT m.user_id FROM {$platform}.`memberships` m LEFT JOIN {$db->table('people')} r ON r.id = m.user_id WHERE m.tenant_id = ? AND r.id IS NULL ORDER BY m.user_id"
        );
        $missing->execute([$db->tenantId]);
        $orphans = $this->pdo->query(
            "SELECT r.id FROM {$db->table('people')} r LEFT JOIN {$platform}.`users` u ON u.id = r.id WHERE u.id IS NULL ORDER BY r.id"
        );
        return [
            'missing' => array_map('intval', $missing->fetchAll(PDO::FETCH_COLUMN)),
            'orphans' => array_map('intval', $orphans->fetchAll(PDO::FETCH_COLUMN)),
        ];
    }
}
