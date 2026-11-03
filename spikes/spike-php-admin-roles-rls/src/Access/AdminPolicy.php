<?php
declare(strict_types=1);

namespace Spike\Admin\Access;

use InvalidArgumentException;

/**
 * Quem pode o quê no admin: a mesma tabela da PoC do layout (pocs/poc-admin-multitenant-panel, AdminAccess.ts), agora
 * no servidor, que é quem recusa de verdade. Regra pura, sem banco.
 *
 * - O master da plataforma pode tudo, em qualquer instituição.
 * - Os outros papéis só valem na instituição da sessão: o master da instituição administra tudo dela; o tutor da
 *   instituição acompanha (pessoas e cursos, sem alterar).
 * - Papéis de curso: o autor vê e edita só os cursos em que foi designado; o tutor do curso vê os alunos desse curso.
 * - O aluno não tem ação nenhuma, então nem entra no admin.
 */
final class AdminPolicy
{
    public const ACTIONS = [
        'institutions.manage', 'platform.admins',
        'members.view', 'members.manage', 'staff.manage', 'enrollments.decide', 'courses.view', 'courses.edit', 'audit.view',
    ];
    private const PLATFORM_ONLY = ['institutions.manage', 'platform.admins'];

    private const BY_TENANT_ROLE = [
        'tenant_admin' => ['members.view', 'members.manage', 'staff.manage', 'enrollments.decide', 'courses.view', 'courses.edit', 'audit.view'],
        'tutor' => ['members.view', 'courses.view'],
        'student' => [],
    ];
    private const BY_COURSE_ROLE = [
        'author' => ['courses.view', 'courses.edit'],
        'tutor' => ['courses.view', 'members.view'],
    ];

    /** As seções do admin e a ação que abre cada uma (a ordem da navegação lateral). */
    private const SECTIONS = [
        'institutions' => 'institutions.manage',
        'members' => 'members.view',
        'enrollments' => 'enrollments.decide',
        'courses' => 'courses.view',
        'audit' => 'audit.view',
    ];

    /** O ator pode fazer a ação nessa instituição (e, nas ações de curso, nesse curso)? */
    public static function can(AdminActor $actor, string $action, ?int $tenantId = null, ?string $courseId = null): bool
    {
        if (!in_array($action, self::ACTIONS, true)) {
            throw new InvalidArgumentException("Ação desconhecida: {$action}");
        }
        if ($actor->platform) {
            return true;
        }
        if (in_array($action, self::PLATFORM_ONLY, true) || $tenantId === null || $tenantId !== $actor->tenantId) {
            return false;
        }
        if (in_array($action, self::BY_TENANT_ROLE[$actor->tenantRole ?? 'student'], true)) {
            return true;
        }
        $courseRole = $courseId === null ? null : ($actor->courseRoles[$courseId] ?? null);
        return $courseRole !== null && in_array($action, self::BY_COURSE_ROLE[$courseRole], true);
    }

    /**
     * As seções que o ator vê: as que ele usa em algum lugar (um papel de curso abre a seção sem curso escolhido).
     *
     * @return list<string>
     */
    public static function sections(AdminActor $actor): array
    {
        $out = [];
        foreach (self::SECTIONS as $section => $action) {
            $byCourse = array_filter($actor->courseRoles, static fn (string $r): bool => in_array($action, self::BY_COURSE_ROLE[$r], true));
            if (self::can($actor, $action, $actor->tenantId) || $byCourse !== []) {
                $out[] = $section;
            }
        }
        return $out;
    }

    /** Entra no admin quem tem pelo menos uma seção. O aluno (ou um vínculo desativado) não entra. */
    public static function canEnter(AdminActor $actor): bool
    {
        return self::sections($actor) !== [];
    }
}
