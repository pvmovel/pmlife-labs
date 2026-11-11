<?php
declare(strict_types=1);

namespace Spike\Chat;

/**
 * A sessão da demo, no lugar do login do produto: a entrada escolhe a instituição fictícia, a turma e o papel, cria a
 * pessoa e guarda só o id dela na sessão PHP. Depois, tudo vem do banco pelo id da sessão.
 */
final class DemoSession
{
    public const TENANTS = ['aurora' => 1, 'boreal' => 2];
    public const COHORTS = ['a', 'b'];

    public static function join(ChatStore $store, string $tenant, string $cohort, string $role): ?Member
    {
        if (!isset(self::TENANTS[$tenant]) || !in_array($cohort, self::COHORTS, true) || !in_array($role, Member::ROLES, true)) {
            return null;
        }
        $names = ['Ana', 'Bia', 'Caio', 'Davi', 'Eva', 'Fábio', 'Gil', 'Hana', 'Ivo', 'Júlia', 'Lia', 'Mário'];
        $name = ($role === 'master' ? 'Master ' : $names[random_int(0, count($names) - 1)] . ' ') . random_int(10, 99);
        $id = $store->addPerson(self::TENANTS[$tenant], $cohort, $name, $role);
        $_SESSION['chat_person'] = $id;
        return $store->person($id);
    }

    public static function current(ChatStore $store): ?Member
    {
        $id = $_SESSION['chat_person'] ?? null;
        return is_int($id) ? $store->person($id) : null;
    }
}
