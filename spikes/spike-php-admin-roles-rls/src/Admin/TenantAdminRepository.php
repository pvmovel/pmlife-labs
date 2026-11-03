<?php
declare(strict_types=1);

namespace Spike\Admin\Admin;

use Spike\Admin\Tenant\TenantScopedRepository;

/**
 * Os dados do admin de UMA instituição: vínculos, papéis de curso e auditoria. Todo SQL passa pelo run() da base,
 * que exige e preenche o tenant do escopo. Quem chama não tem como pedir outra instituição.
 */
final class TenantAdminRepository extends TenantScopedRepository
{
    /** @return array{role: string, active: bool, slug: string, tenantActive: bool}|null */
    public function membership(int $userId): ?array
    {
        $row = $this->run(
            'SELECT m.role, m.active, t.slug, t.active AS tenant_active FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.tenant_id = :tenant_id AND m.user_id = :user_id',
            ['user_id' => $userId],
        )->fetch();
        return $row === false ? null : ['role' => (string) $row['role'], 'active' => (bool) $row['active'], 'slug' => (string) $row['slug'], 'tenantActive' => (bool) $row['tenant_active']];
    }

    /** @return array<string, string> curso => papel */
    public function courseRoles(int $userId): array
    {
        $rows = $this->run('SELECT course_id, role FROM course_staff WHERE tenant_id = :tenant_id AND user_id = :user_id ORDER BY course_id', ['user_id' => $userId])->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $out[(string) $r['course_id']] = (string) $r['role'];
        }
        return $out;
    }

    /**
     * As pessoas da instituição; com um curso, só os alunos matriculados nele (o que o tutor do curso vê).
     *
     * @return list<array{userId: int, name: string, email: string, role: string, active: bool}>
     */
    public function members(?string $courseId = null): array
    {
        $sql = 'SELECT m.user_id, u.display_name, u.email, m.role, m.active FROM memberships m JOIN users u ON u.id = m.user_id';
        $params = [];
        if ($courseId !== null) {
            $sql .= " JOIN enrollments e ON e.tenant_id = m.tenant_id AND e.user_id = m.user_id AND e.course_id = :course_id AND e.status = 'active'";
            $params['course_id'] = $courseId;
        }
        $rows = $this->run($sql . ' WHERE m.tenant_id = :tenant_id ORDER BY u.display_name, m.user_id', $params)->fetchAll();
        return array_map(static fn (array $r): array => [
            'userId' => (int) $r['user_id'],
            'name' => (string) $r['display_name'],
            'email' => (string) $r['email'],
            'role' => (string) $r['role'],
            'active' => (bool) $r['active'],
        ], $rows);
    }

    /** @return array{userId: int, name: string, role: string, active: bool}|null */
    public function member(int $userId): ?array
    {
        $row = $this->run(
            'SELECT m.user_id, u.display_name, m.role, m.active FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = :tenant_id AND m.user_id = :user_id',
            ['user_id' => $userId],
        )->fetch();
        return $row === false ? null : ['userId' => (int) $row['user_id'], 'name' => (string) $row['display_name'], 'role' => (string) $row['role'], 'active' => (bool) $row['active']];
    }

    public function setMemberActive(int $userId, bool $active): void
    {
        $this->run('UPDATE memberships SET active = ' . self::bool($active) . ' WHERE tenant_id = :tenant_id AND user_id = :user_id', ['user_id' => $userId]);
    }

    /** Designa (ou, com $role null, tira) o papel da pessoa no curso. */
    public function setStaff(string $courseId, int $userId, ?string $role, string $at): void
    {
        $this->run('DELETE FROM course_staff WHERE tenant_id = :tenant_id AND course_id = :course_id AND user_id = :user_id', ['course_id' => $courseId, 'user_id' => $userId]);
        if ($role !== null) {
            $this->run(
                'INSERT INTO course_staff (tenant_id, course_id, user_id, role, created_at) VALUES (:tenant_id, :course_id, :user_id, :role, :at)',
                ['course_id' => $courseId, 'user_id' => $userId, 'role' => $role, 'at' => $at],
            );
        }
    }

    /** Uma linha de auditoria nesta instituição ('tenant' = alguém da instituição; 'platform' = o master da plataforma). */
    public function audit(int $actorUserId, string $actorScope, string $action, string $target, string $at): void
    {
        $this->run(
            'INSERT INTO admin_audit (tenant_id, created_at, actor_user_id, actor_scope, action, target) VALUES (:tenant_id, :at, :actor, :scope, :action, :target)',
            ['at' => $at, 'actor' => $actorUserId, 'scope' => $actorScope, 'action' => $action, 'target' => mb_substr($target, 0, 160)],
        );
    }

    /**
     * A auditoria da instituição, da mais nova para a mais antiga. A ação da plataforma sai sem o nome de quem fez.
     *
     * @return list<array{at: string, actor: string|null, platform: bool, action: string, target: string}>
     */
    public function auditLog(): array
    {
        $rows = $this->run(
            "SELECT a.created_at, a.actor_scope, CASE WHEN a.actor_scope = 'platform' THEN NULL ELSE u.display_name END AS actor_name, a.action, a.target
             FROM admin_audit a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.tenant_id = :tenant_id ORDER BY a.id DESC",
        )->fetchAll();
        return array_map(static fn (array $r): array => [
            'at' => substr((string) $r['created_at'], 0, 19),
            'actor' => $r['actor_name'] === null ? null : (string) $r['actor_name'],
            'platform' => $r['actor_scope'] === 'platform',
            'action' => (string) $r['action'],
            'target' => (string) $r['target'],
        ], $rows);
    }
}
