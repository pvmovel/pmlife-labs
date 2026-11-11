<?php
declare(strict_types=1);

namespace Spike\Chat;

/**
 * A sessão da demo, no lugar do login do produto: a entrada escolhe a instituição fictícia, a turma e o papel, cria a
 * pessoa e guarda o id dela na sessão PHP. Depois, tudo vem do banco pelo id.
 *
 * As janelas anônimas do navegador dividem os mesmos cookies (a mesma sessão). Para a demo ter três pessoas em três
 * abas, a sessão guarda a lista de quem entrou por ela, e cada aba diz qual é a dela (`as`). O servidor só aceita um
 * id dessa lista: ninguém fala por uma pessoa que não entrou pela própria sessão. No produto, cada aba é a conta logada.
 */
final class DemoSession
{
    public const TENANTS = ['aurora' => 1, 'boreal' => 2];
    public const COHORTS = ['a', 'b'];
    /** Quantas pessoas uma mesma sessão (as abas do mesmo navegador) guarda. */
    public const MAX_PEOPLE = 10;

    public static function join(ChatStore $store, string $tenant, string $cohort, string $role): ?Member
    {
        if (!isset(self::TENANTS[$tenant]) || !in_array($cohort, self::COHORTS, true) || !in_array($role, Member::ROLES, true)) {
            return null;
        }
        $names = ['Ana', 'Bia', 'Caio', 'Davi', 'Eva', 'Fábio', 'Gil', 'Hana', 'Ivo', 'Júlia', 'Lia', 'Mário'];
        $name = ($role === 'master' ? 'Master ' : $names[random_int(0, count($names) - 1)] . ' ') . random_int(10, 99);
        $id = $store->addPerson(self::TENANTS[$tenant], $cohort, $name, $role);
        $ids = array_values(array_filter((array) ($_SESSION['chat_people'] ?? []), 'is_int'));
        $ids[] = $id;
        $_SESSION['chat_people'] = array_slice($ids, -self::MAX_PEOPLE);
        return $store->person($id);
    }

    /** A pessoa da aba (`as`), só se ela entrou por esta sessão. */
    public static function current(ChatStore $store, mixed $as): ?Member
    {
        $ids = (array) ($_SESSION['chat_people'] ?? []);
        return is_int($as) && in_array($as, $ids, true) ? $store->person($as) : null;
    }
}
