<?php
declare(strict_types=1);

namespace Spike\Auth\Tenant;

/**
 * Quem está pedindo e de qual cliente. Só o AuthService cria, a partir da sessão no servidor: o tenant nunca vem do
 * corpo, da URL nem de um cabeçalho do pedido (o cliente não escolhe o tenant que vai ler).
 */
final class TenantContext
{
    public const ROLES = ['student', 'tenant_admin'];

    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly string $role,
    ) {
        if (!in_array($role, self::ROLES, true)) {
            throw new \InvalidArgumentException("Papel desconhecido: {$role}");
        }
    }

    public function isAdmin(): bool
    {
        return $this->role === 'tenant_admin';
    }
}
