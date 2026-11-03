<?php
declare(strict_types=1);

namespace Spike\Admin\Access;

use PDO;
use Spike\Admin\Admin\TenantAdminRepository;
use Spike\Admin\Tenant\TenantScope;

/**
 * Monta o AdminActor de um pedido a partir da sessão (a pessoa e a instituição em que ela entrou), lendo os papéis
 * do banco a cada vez: um papel tirado ou um vínculo desativado valem já no pedido seguinte, sem esperar a sessão
 * acabar. Usa a conexão com escopo de instituição.
 */
final class ActorResolver
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{0: AdminActor, 1: TenantScope} */
    public function resolve(int $userId, int $tenantId): array
    {
        // platform_admins não tem tenant: é a única leitura fora do escopo, e só responde sobre a própria pessoa.
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM platform_admins WHERE user_id = ?');
        $stmt->execute([$userId]);
        $platform = (int) $stmt->fetchColumn() > 0;

        $repo = new TenantAdminRepository($this->pdo, new TenantScope($tenantId));
        $membership = $repo->membership($userId);
        $scope = new TenantScope($tenantId, $membership['slug'] ?? '');
        if ($membership === null || !$membership['active'] || !$membership['tenantActive']) {
            return [new AdminActor($userId, $platform, $tenantId, null), $scope];
        }
        return [new AdminActor($userId, $platform, $tenantId, $membership['role'], $repo->courseRoles($userId)), $scope];
    }
}
