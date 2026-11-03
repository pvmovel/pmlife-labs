<?php
declare(strict_types=1);

namespace Spike\Admin\Http;

use Closure;
use DateTimeImmutable;
use JsonException;
use Spike\Admin\Access\AdminActor;
use Spike\Admin\Access\AdminPolicy;
use Spike\Admin\Access\AdminSession;
use Spike\Admin\Admin\AdminRejected;
use Spike\Admin\Admin\TenantAdminService;
use Spike\Admin\Platform\PlatformService;
use Spike\Admin\Tenant\TenantScope;

/**
 * GET/POST /api/admin.php?route=... no envelope {status, data|error} do contrato do pmlife:
 *   GET  me                                     quem sou no admin: plataforma, instituição, papéis e seções
 *   GET  institutions?q=&page=                  (plataforma) a lista, com busca e paginação
 *   POST institutions {name, slug, masterEmail} (plataforma) 201 · 409 SLUG_TAKEN · 422 INVALID_INSTITUTION
 *   POST institution-status {slug, active}      (plataforma)
 *   POST platform-admins {email}                (plataforma) outro master da plataforma
 *   GET  members?tenant=&course=                as pessoas (com curso: só os alunos dele)
 *   POST member-status {tenant?, userId, active}
 *   POST staff {tenant?, courseId, userId, role|null}   autor ou tutor de um curso
 *   GET  audit?tenant=
 * A pessoa e a instituição vêm só da sessão. "tenant" no pedido só vale para o master da plataforma; para os outros,
 * uma instituição diferente da sessão é 403 TENANT_FORBIDDEN, sem nem chegar ao banco.
 */
final class AdminApi
{
    private const ROUTES = [
        'me' => ['GET'],
        'institutions' => ['GET', 'POST'],
        'institution-status' => ['POST'],
        'platform-admins' => ['POST'],
        'members' => ['GET'],
        'member-status' => ['POST'],
        'staff' => ['POST'],
        'audit' => ['GET'],
    ];

    /**
     * @param Closure(int, int): array{0: AdminActor, 1: TenantScope} $resolve
     * @param Closure(AdminActor): PlatformService $platform
     * @param Closure(AdminActor, TenantScope, bool): TenantAdminService $tenant o bool diz se é pela conexão da plataforma
     */
    public function __construct(private readonly Closure $resolve, private readonly Closure $platform, private readonly Closure $tenant)
    {
    }

    /**
     * @param array<string, mixed> $query
     * @return array{0: int, 1: array<string, mixed>}
     */
    public function handle(string $method, string $route, array $query, string $body, ?AdminSessionState $session, bool $csrfOk, DateTimeImmutable $now): array
    {
        if (!isset(self::ROUTES[$route])) {
            return self::error(404, 'NOT_FOUND');
        }
        if (!in_array($method, self::ROUTES[$route], true)) {
            return self::error(405, 'METHOD_NOT_ALLOWED');
        }
        if ($session === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        if (!AdminSession::fresh($session->adminAuthAt, $session->adminSeenAt, $now->getTimestamp())) {
            return self::error(401, 'ADMIN_REAUTH');
        }
        if ($method === 'POST' && !$csrfOk) {
            return self::error(403, 'CSRF_INVALID');
        }
        $input = [];
        if ($method === 'POST') {
            try {
                $input = json_decode($body, true, 8, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                return self::error(400, 'INVALID_REQUEST');
            }
            if (!is_array($input)) {
                return self::error(400, 'INVALID_REQUEST');
            }
        }
        [$actor, $own] = ($this->resolve)($session->userId, $session->tenantId);
        if (!AdminPolicy::canEnter($actor)) {
            return self::error(403, 'FORBIDDEN');
        }
        try {
            return match ($route) {
                'me' => self::ok(200, [
                    'platform' => $actor->platform,
                    'tenant' => $own->slug,
                    'tenantRole' => $actor->tenantRole,
                    'courses' => (object) $actor->courseRoles,
                    'sections' => AdminPolicy::sections($actor),
                ]),
                'institutions' => $method === 'GET'
                    ? self::ok(200, $this->platformService($actor)->institutions(self::str($query['q'] ?? ''), (int) ($query['page'] ?? 1)))
                    : self::ok(201, $this->platformService($actor)->createInstitution(self::str($input['name'] ?? ''), self::str($input['slug'] ?? ''), self::str($input['masterEmail'] ?? ''), $now)),
                'institution-status' => self::institutionStatus($this->platformService($actor), $input, $now),
                'platform-admins' => (function () use ($actor, $input, $now): array {
                    $this->platformService($actor)->addPlatformAdmin(self::str($input['email'] ?? ''), $now);
                    return self::ok(200, ['added' => true]);
                })(),
                'members' => self::ok(200, ['members' => $this->tenantService($actor, $own, $query['tenant'] ?? null)->members(isset($query['course']) ? self::str($query['course']) : null)]),
                'member-status' => (function () use ($actor, $own, $input, $now): array {
                    if (!is_int($input['userId'] ?? null) || !is_bool($input['active'] ?? null)) {
                        return self::error(400, 'INVALID_REQUEST');
                    }
                    $this->tenantService($actor, $own, $input['tenant'] ?? null)->setMemberActive($input['userId'], $input['active'], $now);
                    return self::ok(200, ['userId' => $input['userId'], 'active' => $input['active']]);
                })(),
                'staff' => (function () use ($actor, $own, $input, $now): array {
                    if (!is_int($input['userId'] ?? null) || !is_string($input['courseId'] ?? null) || !(is_string($input['role'] ?? null) || ($input['role'] ?? null) === null)) {
                        return self::error(400, 'INVALID_REQUEST');
                    }
                    $this->tenantService($actor, $own, $input['tenant'] ?? null)->setStaff($input['courseId'], $input['userId'], $input['role'] ?? null, $now);
                    return self::ok(200, ['courseId' => $input['courseId'], 'userId' => $input['userId'], 'role' => $input['role'] ?? null]);
                })(),
                'audit' => self::ok(200, ['entries' => $this->tenantService($actor, $own, $query['tenant'] ?? null)->auditLog()]),
            };
        } catch (AdminRejected $e) {
            return self::error($e->status, $e->reason, $e->fields);
        }
    }

    /** O serviço da plataforma só existe para o master da plataforma: os outros recebem 403 antes de ele nascer. */
    private function platformService(AdminActor $actor): PlatformService
    {
        if (!$actor->platform) {
            throw new AdminRejected(403, 'FORBIDDEN');
        }
        return ($this->platform)($actor);
    }

    /** A instituição em que o pedido age: a da sessão, ou (só o master da plataforma) a escolhida no pedido. */
    private function tenantService(AdminActor $actor, TenantScope $own, mixed $requested): TenantAdminService
    {
        if ($requested === null || $requested === $own->slug) {
            return ($this->tenant)($actor, $own, false);
        }
        if (!$actor->platform) {
            throw new AdminRejected(403, 'TENANT_FORBIDDEN');
        }
        return ($this->tenant)($actor, $this->platformService($actor)->scope(self::str($requested)), true);
    }

    private static function institutionStatus(PlatformService $platform, array $input, DateTimeImmutable $now): array
    {
        if (!is_string($input['slug'] ?? null) || !is_bool($input['active'] ?? null)) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $platform->setInstitutionActive($input['slug'], $input['active'], $now);
        return self::ok(200, ['slug' => $input['slug'], 'active' => $input['active']]);
    }

    private static function str(mixed $v): string
    {
        return is_string($v) ? $v : '';
    }

    private static function ok(int $status, array $data): array
    {
        return [$status, ['status' => 'success', 'data' => $data]];
    }

    /** @param array<string, string> $fields */
    private static function error(int $status, string $code, array $fields = []): array
    {
        return [$status, ['status' => 'error', 'error' => ['code' => $code] + ($fields === [] ? [] : ['fields' => $fields])]];
    }
}
