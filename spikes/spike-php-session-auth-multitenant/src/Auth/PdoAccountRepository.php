<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

use DateTimeImmutable;
use PDO;

/**
 * Contas, clientes e vínculos (migration 001). Não tem escopo de tenant: é o que descobre o tenant no cadastro
 * (pelo código de convite) e no login (pelos vínculos da conta).
 */
final class PdoAccountRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{id: int, slug: string, name: string}|null */
    public function tenantByInvite(string $code): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, slug, name FROM tenants WHERE invite_code = ?');
        $stmt->execute([$code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? ['id' => (int) $row['id'], 'slug' => (string) $row['slug'], 'name' => (string) $row['name']] : null;
    }

    /** @return array{id: int, displayName: string, passwordHash: string}|null */
    public function userByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, display_name, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? ['id' => (int) $row['id'], 'displayName' => (string) $row['display_name'], 'passwordHash' => (string) $row['password_hash']] : null;
    }

    /** @return array{id: int, email: string, displayName: string}|null */
    public function userById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, email, display_name FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? ['id' => (int) $row['id'], 'email' => (string) $row['email'], 'displayName' => (string) $row['display_name']] : null;
    }

    /** @return list<array{tenantId: int, slug: string, name: string, role: string}> */
    public function memberships(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT t.id, t.slug, t.name, m.role FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? ORDER BY t.slug'
        );
        $stmt->execute([$userId]);
        return array_map(
            static fn (array $r): array => ['tenantId' => (int) $r['id'], 'slug' => (string) $r['slug'], 'name' => (string) $r['name'], 'role' => (string) $r['role']],
            $stmt->fetchAll(PDO::FETCH_ASSOC),
        );
    }

    /** Conta + vínculo numa transação: nunca fica uma conta sem cliente. */
    public function createStudent(int $tenantId, string $email, string $displayName, string $hash, string $termsVersion, DateTimeImmutable $now): int
    {
        $at = $now->format('Y-m-d H:i:s');
        $this->pdo->beginTransaction();
        try {
            $insert = 'INSERT INTO users (email, display_name, password_hash, terms_version, terms_accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)';
            $params = [$email, $displayName, $hash, $termsVersion, $at, $at];
            if ($this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql') {
                $stmt = $this->pdo->prepare("{$insert} RETURNING id");
                $stmt->execute($params);
                $userId = (int) $stmt->fetchColumn();
            } else {
                $this->pdo->prepare($insert)->execute($params);
                $userId = (int) $this->pdo->lastInsertId();
            }
            $this->addMembership($userId, $tenantId, 'student', $now);
            $this->pdo->commit();
            return $userId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function addMembership(int $userId, int $tenantId, string $role, DateTimeImmutable $now): void
    {
        $this->pdo->prepare('INSERT INTO memberships (user_id, tenant_id, role, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$userId, $tenantId, $role, $now->format('Y-m-d H:i:s')]);
    }

    public function updateHash(int $userId, string $hash): void
    {
        $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $userId]);
    }
}
