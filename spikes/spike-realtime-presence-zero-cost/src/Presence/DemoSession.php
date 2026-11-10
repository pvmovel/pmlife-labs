<?php
declare(strict_types=1);

namespace Spike\Presence;

/**
 * A sessão da demo, no lugar do login do produto: a entrada escolhe uma das duas instituições fictícias e uma das
 * duas turmas, e o servidor guarda isso na sessão PHP. Depois, a sala vem só da sessão: o corpo do pedido não tem
 * como escolher outra instituição, cidade ou turma.
 */
final class DemoSession
{
    public const TENANTS = ['aurora' => 1, 'boreal' => 2];
    public const COHORTS = ['a', 'b'];
    public const CITY = 'cidade-do-curso';

    public static function join(string $tenant, string $cohort, bool $staff = false): ?Seat
    {
        if (!isset(self::TENANTS[$tenant]) || !in_array($cohort, self::COHORTS, true)) {
            return null;
        }
        $id = random_int(1, 2_000_000_000);
        $name = ($staff ? 'Equipe ' : 'Aluno ') . substr((string) $id, -4);
        $_SESSION['seat'] = ['tenant' => self::TENANTS[$tenant], 'user' => $id, 'name' => $name, 'cohort' => $cohort, 'staff' => $staff, 'visible' => !$staff];
        return self::current();
    }

    /** O master aparece ou some (o botão "Aparecer"); só para a equipe. */
    public static function setVisible(bool $visible): ?Seat
    {
        if (!isset($_SESSION['seat']) || $_SESSION['seat']['staff'] !== true) {
            return null;
        }
        $_SESSION['seat']['visible'] = $visible;
        return self::current();
    }

    public static function current(): ?Seat
    {
        $s = $_SESSION['seat'] ?? null;
        if (!is_array($s)) {
            return null;
        }
        return new Seat((int) $s['tenant'], (int) $s['user'], (string) $s['name'], self::CITY, (string) $s['cohort'], (bool) $s['staff'], (bool) $s['visible']);
    }
}
