<?php
declare(strict_types=1);

namespace Spike\Courses\Tenant;

use InvalidArgumentException;

/**
 * (Mesmo papel do TenantContext do spike-php-session-auth-multitenant.) Quem pede e de qual instituição. Na aplicação
 * real só a sessão cria isto: a instituição nunca vem do corpo, da URL nem de um cabeçalho do pedido.
 */
final class TenantContext
{
    public const ROLES = ['student', 'tenant_admin'];

    public function __construct(
        public readonly int $tenantId,
        public readonly string $tenantSlug,
        public readonly int $userId,
        public readonly string $role,
    ) {
        if (!in_array($role, self::ROLES, true)) {
            throw new InvalidArgumentException("Papel desconhecido: {$role}");
        }
    }

    public function isAdmin(): bool
    {
        return $this->role === 'tenant_admin';
    }
}
