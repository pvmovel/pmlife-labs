<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use DateTimeImmutable;

/**
 * A turma de quem entra agora: a turma aberta do curso (o período inclui o momento da matrícula); se houver mais de uma,
 * a que começou por último. Sem turma aberta, a turma padrão ("padrao", sem fim), que o serviço cria se faltar.
 */
final class CohortPicker
{
    public const DEFAULT_SLUG = 'padrao';

    /**
     * @param list<array{id: int, slug: string, starts_at: string, ends_at: ?string}> $cohorts
     * @return array{id: int, slug: string, starts_at: string, ends_at: ?string}|null
     */
    public static function open(array $cohorts, DateTimeImmutable $now): ?array
    {
        $at = $now->format('Y-m-d H:i:s');
        $open = array_values(array_filter($cohorts, static fn (array $c): bool => $c['slug'] !== self::DEFAULT_SLUG
            && $c['starts_at'] <= $at && ($c['ends_at'] === null || $c['ends_at'] > $at)));
        usort($open, static fn (array $a, array $b): int => strcmp($b['starts_at'], $a['starts_at']));
        return $open[0] ?? null;
    }
}
