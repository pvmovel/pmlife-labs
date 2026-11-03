<?php
declare(strict_types=1);

namespace Spike\Admin\Admin;

use DateTimeImmutable;
use Spike\Admin\Access\AdminActor;
use Spike\Admin\Access\AdminPolicy;
use Spike\Admin\Tenant\TenantScope;

/**
 * O admin de uma instituição: as pessoas, os papéis nos cursos e a auditoria. Cada ação confere a regra (AdminPolicy)
 * com a instituição do escopo e grava a auditoria. O mesmo serviço atende o master da instituição (na conexão com
 * escopo) e o master da plataforma que escolheu a instituição (na conexão da plataforma): o SQL é sempre filtrado.
 */
final class TenantAdminService
{
    private const COURSE_ID = '/^[a-z0-9][a-z0-9.-]{0,39}$/';

    public function __construct(
        private readonly TenantAdminRepository $repo,
        private readonly AdminActor $actor,
        private readonly TenantScope $scope,
    ) {
    }

    /** @return list<array{userId: int, name: string, email: string, role: string, active: bool}> */
    public function members(?string $courseId = null): array
    {
        // O tutor de um curso (sem papel na instituição) só passa daqui com o curso dele, e vê só os alunos desse curso.
        $this->allow('members.view', $courseId);
        return $this->repo->members($courseId);
    }

    public function setMemberActive(int $userId, bool $active, DateTimeImmutable $now): void
    {
        $this->allow('members.manage');
        $member = $this->repo->member($userId) ?? throw new AdminRejected(404, 'MEMBER_NOT_FOUND');
        if ($userId === $this->actor->userId && !$active) {
            throw new AdminRejected(409, 'CANNOT_DEACTIVATE_SELF');
        }
        if ($member['active'] === $active) {
            return;
        }
        $this->repo->setMemberActive($userId, $active);
        $this->audit($active ? 'member.reactivated' : 'member.deactivated', $member['name'], $now);
    }

    /** Designa o autor ou o tutor de um curso (ou tira, com $role null). */
    public function setStaff(string $courseId, int $userId, ?string $role, DateTimeImmutable $now): void
    {
        $this->allow('staff.manage');
        if (preg_match(self::COURSE_ID, $courseId) !== 1 || ($role !== null && !in_array($role, AdminActor::COURSE_ROLES, true))) {
            throw new AdminRejected(400, 'INVALID_REQUEST');
        }
        $member = $this->repo->member($userId) ?? throw new AdminRejected(404, 'MEMBER_NOT_FOUND');
        $this->repo->setStaff($courseId, $userId, $role, $now->format('Y-m-d H:i:s'));
        $this->audit($role === null ? 'staff.removed' : "staff.{$role}", "{$member['name']} · {$courseId}", $now);
    }

    /** @return list<array{at: string, actor: string|null, platform: bool, action: string, target: string}> */
    public function auditLog(): array
    {
        $this->allow('audit.view');
        return $this->repo->auditLog();
    }

    private function allow(string $action, ?string $courseId = null): void
    {
        if (!AdminPolicy::can($this->actor, $action, $this->scope->tenantId, $courseId)) {
            throw new AdminRejected(403, 'FORBIDDEN');
        }
    }

    private function audit(string $action, string $target, DateTimeImmutable $now): void
    {
        $this->repo->audit($this->actor->userId, $this->actor->platform ? 'platform' : 'tenant', $action, $target, $now->format('Y-m-d H:i:s'));
    }
}
