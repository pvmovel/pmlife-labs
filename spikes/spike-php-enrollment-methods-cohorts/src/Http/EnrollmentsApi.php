<?php
declare(strict_types=1);

namespace Spike\Enrollment\Http;

use Closure;
use DateTimeImmutable;
use JsonException;
use Spike\Enrollment\Enrollment\EnrollmentRejected;
use Spike\Enrollment\Enrollment\EnrollmentService;
use Spike\Enrollment\Tenant\TenantContext;

/**
 * GET/POST /api/enrollments.php?route=... no envelope {status, data|error} do contrato do pmlife:
 *   GET  catalog                       o prédio de Matrículas: os cursos, o método e o estado do pedido
 *   GET  mine                          o Portal dos cursos: só os cursos em que o aluno está matriculado
 *   POST enroll  {courseId, code?}     201 ativa · 202 aguardando aprovação · 404 · 422 CODE_INVALID · 429 CODE_RATE_LIMITED
 *   GET  pending                       (admin) os pedidos aguardando
 *   POST decide  {userId, courseId, approve}   (admin)
 *   POST rule    {courseId, method, code?}     (admin)
 *   POST cohort  {courseId, slug, startsAt, endsAt?}   (admin)
 * A instituição e o aluno vêm só da sessão (na aplicação real, o cookie; aqui, quem chama passa o TenantContext).
 */
final class EnrollmentsApi
{
    private const ROUTES = ['catalog' => 'GET', 'mine' => 'GET', 'enroll' => 'POST', 'pending' => 'GET', 'decide' => 'POST', 'rule' => 'POST', 'cohort' => 'POST'];

    /** @param Closure(TenantContext): EnrollmentService $service */
    public function __construct(private readonly Closure $service)
    {
    }

    /** @return array{0: int, 1: array<string, mixed>} */
    public function handle(string $method, string $route, string $body, ?TenantContext $tenant, string $ip, DateTimeImmutable $now): array
    {
        if (!isset(self::ROUTES[$route])) {
            return self::error(404, 'NOT_FOUND');
        }
        if ($method !== self::ROUTES[$route]) {
            return self::error(405, 'METHOD_NOT_ALLOWED');
        }
        if ($tenant === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        $input = [];
        if ($method === 'POST') {
            try {
                $input = json_decode($body, true, 8, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                return self::error(400, 'INVALID_REQUEST');
            }
            if (!is_array($input) || !is_string($input['courseId'] ?? null)) {
                return self::error(400, 'INVALID_REQUEST');
            }
        }
        $svc = ($this->service)($tenant);
        try {
            return match ($route) {
                'catalog' => self::ok(200, ['courses' => $svc->catalog()]),
                'mine' => self::ok(200, ['courses' => $svc->enrolledCourses()]),
                'pending' => self::ok(200, ['pending' => $svc->pending()]),
                'enroll' => (static function () use ($svc, $input, $ip, $now): array {
                    $code = is_string($input['code'] ?? null) ? $input['code'] : null;
                    $state = $svc->enroll($input['courseId'], $code, $ip, $now);
                    return self::ok($state['status'] === 'active' ? 201 : 202, $state);
                })(),
                'decide' => (static function () use ($svc, $input, $now): array {
                    if (!is_int($input['userId'] ?? null) || !is_bool($input['approve'] ?? null)) {
                        return self::error(400, 'INVALID_REQUEST');
                    }
                    $svc->decide($input['userId'], $input['courseId'], $input['approve'], $now);
                    return self::ok(200, ['userId' => $input['userId'], 'courseId' => $input['courseId'], 'status' => $input['approve'] ? 'active' : 'rejected']);
                })(),
                'rule' => (static function () use ($svc, $input, $now): array {
                    $svc->setRule($input['courseId'], (string) ($input['method'] ?? ''), is_string($input['code'] ?? null) ? $input['code'] : null, $now);
                    return self::ok(200, ['courseId' => $input['courseId'], 'method' => $input['method']]);
                })(),
                'cohort' => (static function () use ($svc, $input): array {
                    $svc->addCohort($input['courseId'], (string) ($input['slug'] ?? ''), (string) ($input['startsAt'] ?? ''), is_string($input['endsAt'] ?? null) ? $input['endsAt'] : null);
                    return self::ok(201, ['courseId' => $input['courseId'], 'slug' => $input['slug']]);
                })(),
            };
        } catch (EnrollmentRejected $e) {
            return self::error($e->status, $e->reason);
        }
    }

    private static function ok(int $status, array $data): array
    {
        return [$status, ['status' => 'success', 'data' => $data]];
    }

    private static function error(int $status, string $code): array
    {
        return [$status, ['status' => 'error', 'error' => ['code' => $code]]];
    }
}
