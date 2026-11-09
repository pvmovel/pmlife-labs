<?php
declare(strict_types=1);

namespace Spike\TenantDb\Tenant;

use Spike\TenantDb\Platform\TenantRegistry;

/**
 * A fábrica do banco da instituição para um pedido. É o único caminho até um {@see TenantDatabase}:
 * - a instituição pedida tem de ser a da sessão (o master da plataforma escolhe qualquer uma, como no admin);
 * - o banco tem de estar `active` (a instituição "aguardando banco" não aceita alunos).
 *
 * As duas conferências usam só o banco da plataforma: um pedido recusado nunca chega a citar o banco da outra
 * instituição.
 */
final class TenantDatabaseResolver
{
    public function __construct(
        private readonly TenantRegistry $registry,
        private readonly string $platformDatabase,
        private readonly string $environment,
    ) {
    }

    /**
     * @param int $sessionTenantId a instituição da sessão
     * @param int $requestedTenantId a instituição do pedido
     * @param bool $platformAdmin o master da plataforma (vê qualquer instituição)
     * @throws TenantAccessDenied TENANT_FORBIDDEN, TENANT_NOT_FOUND ou TENANT_DB_WAITING
     */
    public function forRequest(int $sessionTenantId, int $requestedTenantId, bool $platformAdmin = false): TenantDatabase
    {
        if (!$platformAdmin && $requestedTenantId !== $sessionTenantId) {
            throw new TenantAccessDenied('TENANT_FORBIDDEN');
        }
        $tenant = $this->registry->find($requestedTenantId) ?? throw new TenantAccessDenied('TENANT_NOT_FOUND');
        if ($tenant['db_state'] !== 'active') {
            throw new TenantAccessDenied('TENANT_DB_WAITING');
        }
        return $this->unchecked($tenant['id']);
    }

    /** O nome do banco (para o admin mostrar o que criar no cPanel, e para o script do Cron). */
    public function nameOf(int $tenantId): string
    {
        return TenantDatabaseName::for($this->platformDatabase, $this->environment, $tenantId);
    }

    /** @internal O banco sem conferir a sessão: só para o script do Cron (que não tem sessão). */
    public function unchecked(int $tenantId): TenantDatabase
    {
        return TenantDatabase::trusted($tenantId, $this->nameOf($tenantId));
    }
}
