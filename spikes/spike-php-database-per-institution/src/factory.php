<?php
declare(strict_types=1);

// O ponto que monta as peças (Composition Root do spike): a conexão única, o cadastro das instituições, o resolver
// do banco da sessão, a réplica e o script de migrations.
require_once __DIR__ . '/bootstrap.php';

use Spike\TenantDb\Db\LoggingPdo;
use Spike\TenantDb\Migrations\TenantMigrator;
use Spike\TenantDb\Platform\TenantRegistry;
use Spike\TenantDb\Replica\PeopleReplica;
use Spike\TenantDb\Tenant\TenantDatabaseResolver;

/**
 * @return array{registry: TenantRegistry, resolver: TenantDatabaseResolver, replica: PeopleReplica, migrator: TenantMigrator}
 */
function spike_tenant_db(LoggingPdo $pdo, string $platformDatabase, string $environment): array
{
    $registry = new TenantRegistry($pdo);
    $resolver = new TenantDatabaseResolver($registry, $platformDatabase, $environment);
    $replica = new PeopleReplica($pdo, $platformDatabase);
    $migrator = new TenantMigrator($pdo, $registry, $resolver, $replica, $platformDatabase, dirname(__DIR__) . '/migrations/mysql-tenant');
    return ['registry' => $registry, 'resolver' => $resolver, 'replica' => $replica, 'migrator' => $migrator];
}
