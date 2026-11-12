<?php
declare(strict_types=1);

namespace Spike\Badges;

/**
 * As regras puras das medalhas e da conclusão do curso, as mesmas de src/badges.ts (os dois lados rodam cases/):
 * - o critério de uma medalha: uma fase concluída, um atributo com pelo menos `min` pontos, ou o curso concluído;
 * - o curso está concluído quando todas as fases dele estão concluídas (decisão do Pablo, 2026-11-11);
 * - os problemas das medalhas declaradas no documento do curso.
 */
final class BadgeRules
{
    public const ICONS = ['star', 'flag', 'trophy', 'book', 'rocket', 'heart'];
    public const MAX_BADGES = 30;
    private const ID = '/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/';

    /**
     * @param list<string> $phases as fases do curso
     * @param array{phases: list<string>, attributes: array<string, int>} $progress
     */
    public static function courseCompleted(array $phases, array $progress): bool
    {
        return $phases !== [] && array_diff($phases, $progress['phases']) === [];
    }

    /**
     * @param list<array<string, mixed>> $badges
     * @param list<string> $phases
     * @param array{phases: list<string>, attributes: array<string, int>} $progress
     * @return list<string> as ganhas, na ordem declarada
     */
    public static function earned(array $badges, array $phases, array $progress): array
    {
        $out = [];
        foreach ($badges as $b) {
            $c = $b['criterion'];
            $ok = match ($c['kind']) {
                'phase' => in_array($c['phase'], $progress['phases'], true),
                'attribute' => ($progress['attributes'][$c['attribute']] ?? 0) >= $c['min'],
                default => self::courseCompleted($phases, $progress),
            };
            if ($ok) {
                $out[] = $b['id'];
            }
        }
        return $out;
    }

    /**
     * @param list<mixed> $badges
     * @param list<string> $phases
     * @param list<string> $attributes
     * @return list<string> `CÓDIGO@caminho`
     */
    public static function problems(array $badges, array $phases, array $attributes): array
    {
        $out = [];
        if (count($badges) > self::MAX_BADGES) {
            $out[] = 'TOO_MANY_BADGES@/badges';
        }
        $seen = [];
        foreach ($badges as $i => $raw) {
            $at = "/badges/{$i}";
            $b = is_array($raw) ? $raw : [];
            $id = $b['id'] ?? null;
            if (!is_string($id) || preg_match(self::ID, $id) !== 1) {
                $out[] = "BADGE_ID_INVALID@{$at}/id";
            } elseif (isset($seen[$id])) {
                $out[] = "BADGE_DUPLICATE@{$at}/id";
            } else {
                $seen[$id] = true;
            }
            if (!is_string($b['titleKey'] ?? null) || $b['titleKey'] === '') {
                $out[] = "FIELD_REQUIRED@{$at}/titleKey";
            }
            if (!in_array($b['icon'] ?? null, self::ICONS, true)) {
                $out[] = "BADGE_ICON_INVALID@{$at}/icon";
            }
            $c = is_array($b['criterion'] ?? null) ? $b['criterion'] : [];
            $kind = $c['kind'] ?? null;
            if ($kind === 'phase') {
                if (!is_string($c['phase'] ?? null) || !in_array($c['phase'], $phases, true)) {
                    $out[] = "BADGE_PHASE_UNKNOWN@{$at}/criterion/phase";
                }
            } elseif ($kind === 'attribute') {
                if (!is_string($c['attribute'] ?? null) || !in_array($c['attribute'], $attributes, true)) {
                    $out[] = "BADGE_ATTRIBUTE_UNKNOWN@{$at}/criterion/attribute";
                }
                $min = $c['min'] ?? null;
                if (!is_int($min) || $min < 1 || $min > 10000) {
                    $out[] = "BADGE_MIN_INVALID@{$at}/criterion/min";
                }
            } elseif ($kind !== 'course') {
                $out[] = "BADGE_CRITERION_INVALID@{$at}/criterion";
            }
        }
        return $out;
    }
}
