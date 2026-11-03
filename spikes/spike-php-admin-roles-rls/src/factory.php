<?php
declare(strict_types=1);

// Monta a API do admin (o único lugar que instancia os adapters). Duas conexões: a com escopo de instituição e a da
// plataforma. No MySQL da hospedagem compartilhada as duas podem ser a mesma (um usuário de banco); no PostgreSQL são
// usuários diferentes, membros de app_tenant e de app_platform (migration 003), e o RLS separa o que cada um vê.
require_once __DIR__ . '/bootstrap.php';

use Spike\Admin\Access\ActorResolver;
use Spike\Admin\Access\AdminActor;
use Spike\Admin\Admin\TenantAdminRepository;
use Spike\Admin\Admin\TenantAdminService;
use Spike\Admin\Http\AdminApi;
use Spike\Admin\Platform\PlatformRepository;
use Spike\Admin\Platform\PlatformService;
use Spike\Admin\Tenant\TenantScope;

function spike_admin_api(PDO $tenantPdo, PDO $platformPdo): AdminApi
{
    return new AdminApi(
        static fn (int $userId, int $tenantId): array => (new ActorResolver($tenantPdo))->resolve($userId, $tenantId),
        static fn (AdminActor $actor): PlatformService => new PlatformService(new PlatformRepository($platformPdo, $actor->platform), $actor),
        static fn (AdminActor $actor, TenantScope $scope, bool $viaPlatform): TenantAdminService => new TenantAdminService(
            new TenantAdminRepository($viaPlatform ? $platformPdo : $tenantPdo, $scope),
            $actor,
            $scope,
        ),
    );
}
