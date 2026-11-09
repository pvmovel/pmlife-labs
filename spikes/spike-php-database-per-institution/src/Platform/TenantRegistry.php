<?php
declare(strict_types=1);

namespace Spike\TenantDb\Platform;

use PDO;

/**
 * O cadastro das instituições no banco da plataforma, com o estado do banco de cada uma:
 * - `waiting`: aguardando banco (ainda não existe, ou o usuário do site não foi ligado a ele no cPanel);
 * - `migrating`: o banco existe e o script do Cron está aplicando as migrations e a réplica;
 * - `active`: pronto, a instituição aceita alunos.
 */
final class TenantRegistry
{
    public const STATES = ['waiting', 'migrating', 'active'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array{id: int, slug: string, db_state: string, db_version: string|null, db_error: string|null}> */
    public function all(): array
    {
        $rows = $this->pdo->query('SELECT id, slug, db_state, db_version, db_error FROM tenants ORDER BY id')->fetchAll();
        return array_map(static fn (array $r): array => ['id' => (int) $r['id']] + $r, $rows);
    }

    /** @return array{id: int, slug: string, db_state: string}|null */
    public function find(int $id): ?array
    {
        $st = $this->pdo->prepare('SELECT id, slug, db_state FROM tenants WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        return $row === false ? null : ['id' => (int) $row['id'], 'slug' => $row['slug'], 'db_state' => $row['db_state']];
    }

    public function idOf(string $slug): ?int
    {
        $st = $this->pdo->prepare('SELECT id FROM tenants WHERE slug = ?');
        $st->execute([$slug]);
        $id = $st->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    public function mark(int $id, string $state, ?string $version, ?string $error, string $now): void
    {
        $st = $this->pdo->prepare('UPDATE tenants SET db_state = ?, db_version = ?, db_error = ?, db_checked_at = ? WHERE id = ?');
        $st->execute([$state, $version, $error, $now, $id]);
    }
}
