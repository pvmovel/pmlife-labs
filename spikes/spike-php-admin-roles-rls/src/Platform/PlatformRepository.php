<?php
declare(strict_types=1);

namespace Spike\Admin\Platform;

use LogicException;
use PDO;
use Throwable;

/**
 * O ÚNICO repositório que alcança todas as instituições. Só nasce para o master da plataforma (a trava é no
 * construtor) e, no PostgreSQL, usa a conexão do papel app_platform. Toda escrita daqui grava a auditoria.
 */
final class PlatformRepository
{
    public function __construct(private readonly PDO $pdo, bool $platformActor)
    {
        if (!$platformActor) {
            throw new LogicException('O repositório da plataforma é só do master da plataforma');
        }
    }

    /** @return array{items: list<array{slug: string, name: string, active: bool, members: int, createdAt: string}>, total: int} */
    public function institutions(string $search, int $page, int $size): array
    {
        $like = '%' . strtr(mb_strtolower(trim($search)), ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
        $where = 'WHERE LOWER(t.name) LIKE ? OR t.slug LIKE ?';
        $count = $this->pdo->prepare("SELECT COUNT(*) FROM tenants t {$where}");
        $count->execute([$like, $like]);
        $offset = max(0, $page - 1) * $size;
        $stmt = $this->pdo->prepare(
            "SELECT t.slug, t.name, t.active, t.created_at, (SELECT COUNT(*) FROM memberships m WHERE m.tenant_id = t.id) AS members
             FROM tenants t {$where} ORDER BY t.name, t.id LIMIT {$size} OFFSET {$offset}"
        );
        $stmt->execute([$like, $like]);
        return [
            'items' => array_map(static fn (array $r): array => [
                'slug' => (string) $r['slug'],
                'name' => (string) $r['name'],
                'active' => (bool) $r['active'],
                'members' => (int) $r['members'],
                'createdAt' => substr((string) $r['created_at'], 0, 10),
            ], $stmt->fetchAll()),
            'total' => (int) $count->fetchColumn(),
        ];
    }

    /** @return array{id: int, slug: string, name: string, active: bool}|null */
    public function tenantBySlug(string $slug): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, slug, name, active FROM tenants WHERE slug = ?');
        $stmt->execute([$slug]);
        $r = $stmt->fetch();
        return $r === false ? null : ['id' => (int) $r['id'], 'slug' => (string) $r['slug'], 'name' => (string) $r['name'], 'active' => (bool) $r['active']];
    }

    /** @return array{id: int, name: string}|null */
    public function userByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, display_name FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $r = $stmt->fetch();
        return $r === false ? null : ['id' => (int) $r['id'], 'name' => (string) $r['display_name']];
    }

    /**
     * Cria a instituição e dá ao master dela o vínculo tenant_admin, numa transação. Se o e-mail ainda não tem conta,
     * ela nasce com uma senha impossível de adivinhar (ninguém a conhece) e sem o aceite dos termos: a pessoa define
     * a senha pelo "Esqueci a senha" (US39) e aceita os termos no primeiro acesso.
     *
     * @return array{tenantId: int, masterId: int, masterName: string, master: 'created'|'existing'}
     */
    public function createInstitution(string $name, string $slug, string $masterEmail, string $at): array
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('INSERT INTO tenants (slug, name, invite_code, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$slug, $name, strtoupper(bin2hex(random_bytes(6))), $at]);
            $tenantId = (int) ($this->tenantBySlug($slug)['id'] ?? 0);
            $user = $this->userByEmail($masterEmail);
            $master = 'existing';
            if ($user === null) {
                $display = mb_substr(explode('@', $masterEmail)[0], 0, 40);
                $this->pdo->prepare('INSERT INTO users (email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
                    ->execute([$masterEmail, $display, password_hash(bin2hex(random_bytes(32)), PASSWORD_ARGON2ID), $at]);
                $user = $this->userByEmail($masterEmail);
                $master = 'created';
            }
            $this->pdo->prepare("INSERT INTO memberships (user_id, tenant_id, role, created_at) VALUES (?, ?, 'tenant_admin', ?)")
                ->execute([$user['id'], $tenantId, $at]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['tenantId' => $tenantId, 'masterId' => $user['id'], 'masterName' => $user['name'], 'master' => $master];
    }

    public function setTenantActive(int $tenantId, bool $active): void
    {
        $this->pdo->prepare('UPDATE tenants SET active = ' . ($active ? 'TRUE' : 'FALSE') . ' WHERE id = ?')->execute([$tenantId]);
    }

    /** @return bool true se entrou agora (false se já era master da plataforma) */
    public function addPlatformAdmin(int $userId, int $createdBy, string $at): bool
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM platform_admins WHERE user_id = ?');
        $stmt->execute([$userId]);
        if ((int) $stmt->fetchColumn() > 0) {
            return false;
        }
        $this->pdo->prepare('INSERT INTO platform_admins (user_id, created_at, created_by) VALUES (?, ?, ?)')->execute([$userId, $at, $createdBy]);
        return true;
    }

    /** Auditoria de uma ação da plataforma: numa instituição (a instituição vê) ou na plataforma (tenant NULL). */
    public function audit(int $actorUserId, ?int $tenantId, string $action, string $target, string $at): void
    {
        $this->pdo->prepare("INSERT INTO admin_audit (created_at, actor_user_id, actor_scope, tenant_id, action, target) VALUES (?, ?, 'platform', ?, ?, ?)")
            ->execute([$at, $actorUserId, $tenantId, $action, mb_substr($target, 0, 160)]);
    }
}
