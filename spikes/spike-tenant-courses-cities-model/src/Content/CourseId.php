<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

/**
 * O id de um curso, que o progresso do aluno já guarda (quest_completions.track_id, até 40 caracteres).
 *
 * - Plataforma (curso-modelo): "dev-to-pm" (minúsculas, dígitos e hífen). O id de hoje é mantido na migração para
 *   o progresso gravado continuar valendo.
 * - Instituição: "<slug da instituição>.<slug do curso>" (ex.: "aurora.concursos"). O ponto nunca aparece num id da
 *   plataforma, então um curso novo da plataforma nunca colide com o de uma instituição, e duas instituições podem
 *   ter cada uma o seu "concursos".
 */
final class CourseId
{
    public const SLUG = '/^[a-z][a-z0-9-]{1,18}$/';
    private const PLATFORM = '/^[a-z][a-z0-9-]{1,39}$/';
    private const TENANT_SLUG = '/^[a-z][a-z0-9-]{1,19}$/';

    public static function isValid(string $id): bool
    {
        return self::isPlatform($id) || self::split($id) !== null;
    }

    public static function isPlatform(string $id): bool
    {
        return preg_match(self::PLATFORM, $id) === 1;
    }

    public static function forTenant(string $tenantSlug, string $slug): ?string
    {
        if (preg_match(self::TENANT_SLUG, $tenantSlug) !== 1 || preg_match(self::SLUG, $slug) !== 1) {
            return null;
        }
        return "{$tenantSlug}.{$slug}";
    }

    /** @return array{string, string}|null [slug da instituição, slug do curso] */
    public static function split(string $id): ?array
    {
        $parts = explode('.', $id);
        if (count($parts) !== 2 || self::forTenant($parts[0], $parts[1]) === null) {
            return null;
        }
        return [$parts[0], $parts[1]];
    }
}
