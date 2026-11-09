<?php
declare(strict_types=1);

namespace Spike\TenantDb\Migrations;

use PDO;
use Spike\TenantDb\Db\SqlFile;
use Spike\TenantDb\Platform\TenantRegistry;
use Spike\TenantDb\Replica\PeopleReplica;
use Spike\TenantDb\Tenant\TenantDatabaseResolver;
use Throwable;

/**
 * O script do Cron (e do deploy): para cada instituição cadastrada, confere se o banco dela existe e se o usuário do
 * site o enxerga, aplica as migrations da instituição que faltam, faz o backfill da réplica e marca o estado. A API
 * nunca roda DDL; só este script, pela linha de comando.
 *
 * - Uma trava com nome no MySQL (`GET_LOCK`) impede duas execuções juntas (o Cron e o deploy no mesmo minuto).
 * - Cada banco tem a própria `schema_migrations`. As migrations rodam com `USE` no banco da instituição, uma de cada
 *   vez, e a conexão volta ao banco da plataforma no fim (o `USE` é só deste script).
 * - Um banco com erro fica em `migrating`, com o erro anotado, e não segura os outros.
 */
final class TenantMigrator
{
    public const LOCK = 'spike_tenant_migrations';

    public function __construct(
        private readonly PDO $pdo,
        private readonly TenantRegistry $registry,
        private readonly TenantDatabaseResolver $resolver,
        private readonly PeopleReplica $replica,
        private readonly string $platformDatabase,
        private readonly string $migrationsDir,
    ) {
    }

    /**
     * @return array{status: 'done'|'busy', tenants: list<array{id: int, db: string, state: string, applied: list<string>, people: int|null, error: string|null}>}
     */
    public function run(string $now): array
    {
        if ((int) $this->pdo->query("SELECT GET_LOCK('" . self::LOCK . "', 0)")->fetchColumn() !== 1) {
            return ['status' => 'busy', 'tenants' => []];
        }
        try {
            $out = [];
            foreach ($this->registry->all() as $tenant) {
                $out[] = $this->migrateOne($tenant['id'], $now);
            }
            return ['status' => 'done', 'tenants' => $out];
        } finally {
            $this->pdo->exec("USE `{$this->platformDatabase}`");
            $this->pdo->query("SELECT RELEASE_LOCK('" . self::LOCK . "')");
        }
    }

    /** @return list<string> as versões das migrations da instituição, em ordem (`001_create_people.sql` ➔ `001`). */
    public function available(): array
    {
        $files = glob("{$this->migrationsDir}/*.sql") ?: [];
        sort($files);
        return array_map(static fn (string $f): string => substr(basename($f), 0, 3), $files);
    }

    /** @return array{id: int, db: string, state: string, applied: list<string>, people: int|null, error: string|null} */
    private function migrateOne(int $tenantId, string $now): array
    {
        $name = $this->resolver->nameOf($tenantId);
        $result = ['id' => $tenantId, 'db' => $name, 'state' => 'waiting', 'applied' => [], 'people' => null, 'error' => null];
        // O usuário do site só enxerga os bancos a que foi ligado: sem a ligação no cPanel, o banco "não existe" aqui.
        $st = $this->pdo->prepare('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?');
        $st->execute([$name]);
        if ((int) $st->fetchColumn() === 0) {
            $this->registry->mark($tenantId, 'waiting', null, null, $now);
            return $result;
        }
        $version = null;
        try {
            $this->registry->mark($tenantId, 'migrating', null, null, $now);
            $this->pdo->exec("USE `{$name}`");
            $this->pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version CHAR(3) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
            $done = $this->pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
            foreach (glob("{$this->migrationsDir}/*.sql") ?: [] as $file) {
                $v = substr(basename($file), 0, 3);
                if (in_array($v, $done, true)) {
                    continue;
                }
                foreach (SqlFile::statements((string) file_get_contents($file)) as $sql) {
                    $this->pdo->exec($sql);
                }
                $ins = $this->pdo->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
                $ins->execute([$v, $now]);
                $result['applied'][] = $v;
            }
            $version = (string) $this->pdo->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn();
            $this->pdo->exec("USE `{$this->platformDatabase}`");
            $result['people'] = $this->replica->backfill($this->resolver->unchecked($tenantId), $now);
            $this->registry->mark($tenantId, 'active', $version, null, $now);
            $result['state'] = 'active';
        } catch (Throwable $e) {
            $this->pdo->exec("USE `{$this->platformDatabase}`");
            $result['state'] = 'migrating';
            $result['error'] = $e->getMessage();
            $this->registry->mark($tenantId, 'migrating', $version, substr($e->getMessage(), 0, 250), $now);
        }
        return $result;
    }
}
