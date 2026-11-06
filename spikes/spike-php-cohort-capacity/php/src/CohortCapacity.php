<?php
declare(strict_types=1);

namespace Spike\Cohort;

/**
 * O espelho em PHP de src/Domain/CohortCapacity.ts (US48), com os mesmos casos de conformidade (cases/*.json): o
 * limite da turma em múltiplos de 4, de 4 a 48, até o teto da instituição, e a turma de quem se matricula agora (a
 * aberta que começou por último, ou a seguinte). PHP puro, sem banco.
 */
final class CohortCapacity
{
    public const STEP = 4;
    public const MIN = 4;
    public const MAX = 48;
    public const DEFAULT = 12;

    /** O problema do limite (COHORT_LIMIT_INVALID ou COHORT_LIMIT_ABOVE_CEILING), ou null se vale. */
    public static function limitProblem(int|float $limit, ?int $ceiling = null): ?string
    {
        if (!is_int($limit) || $limit < self::MIN || $limit > self::MAX || $limit % self::STEP !== 0) {
            return 'COHORT_LIMIT_INVALID';
        }
        if ($ceiling !== null && $limit > $ceiling) {
            return 'COHORT_LIMIT_ABOVE_CEILING';
        }
        return null;
    }

    /** @return list<int> as opções do seletor: 4, 8, 12 … até o teto */
    public static function limitOptions(int $ceiling = self::MAX): array
    {
        $top = self::limitProblem($ceiling) === null ? $ceiling : self::MAX;
        return range(self::MIN, $top, self::STEP);
    }

    public static function effectiveCapacity(int $capacity, int $ceiling): int
    {
        return min($capacity, $ceiling);
    }

    /** @param array{id: int, slug: string, startsAt: string, endsAt: ?string, capacity: int, enrolled: int} $c */
    public static function isOpen(array $c, string $now, int $ceiling): bool
    {
        return $c['startsAt'] <= $now && ($c['endsAt'] === null || $c['endsAt'] > $now) && $c['enrolled'] < self::effectiveCapacity($c['capacity'], $ceiling);
    }

    /** @param list<string> $slugs */
    public static function nextSlug(array $slugs): string
    {
        $n = count($slugs) + 1;
        while (in_array("turma-{$n}", $slugs, true)) {
            $n++;
        }
        return "turma-{$n}";
    }

    /**
     * @param list<array{id: int, slug: string, startsAt: string, endsAt: ?string, capacity: int, enrolled: int}> $cohorts
     * @return array{kind: 'existing', id: int, slug: string}|array{kind: 'new', slug: string, capacity: int}
     */
    public static function choose(array $cohorts, string $now, int $courseLimit, int $ceiling): array
    {
        $open = array_values(array_filter($cohorts, static fn (array $c): bool => self::isOpen($c, $now, $ceiling)));
        usort($open, static fn (array $a, array $b): int => $a['startsAt'] === $b['startsAt'] ? $a['id'] <=> $b['id'] : strcmp($b['startsAt'], $a['startsAt']));
        if ($open !== []) {
            return ['kind' => 'existing', 'id' => $open[0]['id'], 'slug' => $open[0]['slug']];
        }
        return ['kind' => 'new', 'slug' => self::nextSlug(array_column($cohorts, 'slug')), 'capacity' => self::effectiveCapacity($courseLimit, $ceiling)];
    }
}
