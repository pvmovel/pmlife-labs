<?php
declare(strict_types=1);

namespace Spike\Notices;

/**
 * A sessão da demo, no lugar do login do produto: a entrada escolhe uma das duas instituições fictícias e um papel, e o
 * servidor guarda isso na sessão PHP. Depois, a instituição vem só da sessão.
 */
final class DemoSession
{
    public const TENANTS = ['aurora' => 1, 'boreal' => 2];
    public const COURSE = 'dev-to-pm';

    public static function join(string $tenant, string $role): ?Author
    {
        if (!isset(self::TENANTS[$tenant]) || !in_array($role, Author::ROLES, true)) {
            return null;
        }
        $names = ['student' => 'Aluno', 'master' => 'Master', 'author' => 'Autor'];
        $_SESSION['author'] = ['tenant' => self::TENANTS[$tenant], 'name' => $names[$role] . ' ' . random_int(1000, 9999), 'role' => $role];
        return self::current();
    }

    public static function current(): ?Author
    {
        $a = $_SESSION['author'] ?? null;
        if (!is_array($a)) {
            return null;
        }
        return new Author((int) $a['tenant'], (string) $a['name'], (string) $a['role'], $a['role'] === 'author' ? [self::COURSE] : []);
    }
}
