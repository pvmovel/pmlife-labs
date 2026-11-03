<?php
declare(strict_types=1);

namespace Spike\Admin\Access;

use InvalidArgumentException;

/**
 * Quem está no admin, lido do banco a cada pedido (ActorResolver), nunca do corpo nem da URL. Os papéis valem por
 * contexto (ADR-012): a plataforma (platform_admins), a instituição da sessão (memberships) e os cursos (course_staff).
 * Vínculo ou instituição desativados não dão papel nenhum.
 */
final class AdminActor
{
    public const TENANT_ROLES = ['student', 'tenant_admin', 'tutor'];
    public const COURSE_ROLES = ['author', 'tutor'];

    /** @param array<string, string> $courseRoles curso => papel nele ('author' ou 'tutor') */
    public function __construct(
        public readonly int $userId,
        public readonly bool $platform,
        public readonly ?int $tenantId,
        public readonly ?string $tenantRole,
        public readonly array $courseRoles = [],
    ) {
        if ($tenantRole !== null && !in_array($tenantRole, self::TENANT_ROLES, true)) {
            throw new InvalidArgumentException("Papel desconhecido: {$tenantRole}");
        }
        foreach ($courseRoles as $role) {
            if (!in_array($role, self::COURSE_ROLES, true)) {
                throw new InvalidArgumentException("Papel de curso desconhecido: {$role}");
            }
        }
    }
}
