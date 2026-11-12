<?php
declare(strict_types=1);

namespace Spike\Badges;

/**
 * A sessão da demo, no lugar do login e do progresso do produto: a entrada escolhe a instituição fictícia e o nome; o
 * progresso no curso (as fases e os pontos) fica na sessão PHP. A instituição, a pessoa e o progresso vêm só da sessão:
 * o certificado não pode ser pedido para outra pessoa nem com um progresso inventado no pedido.
 */
final class DemoSession
{
    public static function join(int $tenantId, string $name): ?array
    {
        $name = trim($name);
        if (!isset(DemoCourse::TENANTS[$tenantId]) || $name === '' || mb_strlen($name) > 40 || preg_match('/[\x00-\x1F\x7F<>]/u', $name) === 1) {
            return null;
        }
        $id = random_int(100000, 999999);
        $_SESSION['badges'] = ['tenant' => $tenantId, 'user' => $id, 'name' => $name, 'email' => "aluno{$id}@exemplo.test", 'phases' => [], 'attributes' => ['comunicacao' => 0, 'sql' => 0]];
        return self::current();
    }

    /** @return array{tenant: int, user: int, name: string, email: string, phases: list<string>, attributes: array<string, int>}|null */
    public static function current(): ?array
    {
        $s = $_SESSION['badges'] ?? null;
        return is_array($s) ? $s : null;
    }

    public static function completePhase(string $phase): bool
    {
        if (!isset($_SESSION['badges']) || !isset(DemoCourse::PHASES[$phase])) {
            return false;
        }
        $phases = $_SESSION['badges']['phases'];
        if (!in_array($phase, $phases, true)) {
            $phases[] = $phase;
        }
        $_SESSION['badges']['phases'] = $phases;
        return true;
    }

    public static function addPoints(string $attribute, int $points): bool
    {
        if (!isset($_SESSION['badges']) || !isset(DemoCourse::ATTRIBUTES[$attribute]) || $points < 1 || $points > 50) {
            return false;
        }
        $_SESSION['badges']['attributes'][$attribute] += $points;
        return true;
    }
}
