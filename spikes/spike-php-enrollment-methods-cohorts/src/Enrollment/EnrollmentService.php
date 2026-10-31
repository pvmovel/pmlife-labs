<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use DateTimeImmutable;
use Spike\Enrollment\Tenant\TenantContext;

/**
 * A matrícula da instituição da sessão (US44). Decisões do Pablo:
 * - a regra de cada curso fica numa tabela própria (o código só como hash); sem regra, a matrícula é livre;
 * - a turma é a turma aberta do curso no momento em que a matrícula fica ativa, ou a turma padrão;
 * - só quem está matriculado registra progresso (NOT_ENROLLED);
 * - o Portal dos cursos lista só os cursos em que o aluno está matriculado; o catálogo é o prédio de Matrículas.
 */
final class EnrollmentService
{
    public function __construct(
        private readonly EnrollmentRepository $repo,
        private readonly CourseCatalog $courses,
        private readonly CodeThrottle $throttle,
        private readonly TenantContext $tenant,
        private readonly string $salt,
    ) {
    }

    /**
     * O prédio de Matrículas: os cursos da instituição, o método de cada um e o estado do pedido do aluno.
     *
     * @return list<array{courseId: string, method: string, status: ?string, cohort: ?string}>
     */
    public function catalog(): array
    {
        $methods = $this->repo->methods();
        $mine = $this->repo->ofUser($this->tenant->userId);
        return array_map(static fn (string $id): array => [
            'courseId' => $id,
            'method' => $methods[$id] ?? 'free',
            'status' => $mine[$id]['status'] ?? null,
            'cohort' => $mine[$id]['cohort'] ?? null,
        ], $this->courses->courseIds());
    }

    /**
     * O aluno pede a matrícula. Já matriculado (ou aguardando) devolve o mesmo estado: o pedido é idempotente.
     *
     * @return array{status: string, cohort: ?string}
     * @throws EnrollmentRejected
     */
    public function enroll(string $courseId, ?string $code, string $ip, DateTimeImmutable $now): array
    {
        if (!in_array($courseId, $this->courses->courseIds(), true)) {
            throw new EnrollmentRejected('COURSE_NOT_FOUND', 404);
        }
        $current = $this->repo->find($this->tenant->userId, $courseId);
        if ($current !== null && $current['status'] !== 'rejected') {
            return $this->state($courseId);
        }
        $method = EnrollmentMethods::for($this->repo->rule($courseId), $this->salt);
        if ($method->name() === 'code' && $this->throttle->blocked($this->tenant->tenantId, $courseId, $ip, $now)) {
            throw new EnrollmentRejected('CODE_RATE_LIMITED', 429);
        }
        $decision = $method->decide($code);
        if ($decision->outcome === Decision::REFUSED) {
            if ($decision->error === 'CODE_INVALID') {
                $this->throttle->fail($this->tenant->tenantId, $courseId, $ip, $now);
            }
            throw new EnrollmentRejected((string) $decision->error, 422);
        }
        if ($decision->outcome === Decision::ACTIVE) {
            $this->repo->save($this->tenant->userId, $courseId, 'active', $this->cohortFor($courseId, $now), $now, true);
        } else {
            $this->repo->save($this->tenant->userId, $courseId, 'pending', null, $now, false);
        }
        return $this->state($courseId);
    }

    /** @return list<array{userId: int, courseId: string, requestedAt: string}> os pedidos aguardando o admin */
    public function pending(): array
    {
        $this->requireAdmin();
        return $this->repo->pending();
    }

    /** O admin aprova (a matrícula fica ativa, na turma aberta agora) ou recusa um pedido. */
    public function decide(int $userId, string $courseId, bool $approve, DateTimeImmutable $now): void
    {
        $this->requireAdmin();
        if (($this->repo->find($userId, $courseId)['status'] ?? null) !== 'pending') {
            throw new EnrollmentRejected('NOT_PENDING', 409);
        }
        $this->repo->save($userId, $courseId, $approve ? 'active' : 'rejected', $approve ? $this->cohortFor($courseId, $now) : null, $now, true);
    }

    /** O admin define o método de um curso (o código vai só como hash). */
    public function setRule(string $courseId, string $method, ?string $code, DateTimeImmutable $now): void
    {
        $this->requireAdmin();
        if (!in_array($courseId, $this->courses->courseIds(), true)) {
            throw new EnrollmentRejected('COURSE_NOT_FOUND', 404);
        }
        if (!in_array($method, EnrollmentMethods::NAMES, true) || ($method === 'code' && ($code === null || strlen(trim($code)) < 6))) {
            throw new EnrollmentRejected('RULE_INVALID', 422);
        }
        $this->repo->saveRule($courseId, $method, $method === 'code' ? CodeEnrollment::hash((string) $code, $this->salt) : null, $now);
    }

    /** O admin abre uma turma com período. */
    public function addCohort(string $courseId, string $slug, string $startsAt, ?string $endsAt): void
    {
        $this->requireAdmin();
        if (!in_array($courseId, $this->courses->courseIds(), true)) {
            throw new EnrollmentRejected('COURSE_NOT_FOUND', 404);
        }
        if (preg_match('/^[a-z0-9][a-z0-9-]{0,19}$/', $slug) !== 1 || $slug === CohortPicker::DEFAULT_SLUG || ($endsAt !== null && $endsAt <= $startsAt)) {
            throw new EnrollmentRejected('COHORT_INVALID', 422);
        }
        $this->repo->createCohort($courseId, $slug, $startsAt, $endsAt);
    }

    /** @return list<string> o Portal dos cursos: só os cursos em que o aluno está matriculado (e que a instituição vê) */
    public function enrolledCourses(): array
    {
        $mine = $this->repo->ofUser($this->tenant->userId);
        return array_values(array_filter($this->courses->courseIds(), static fn (string $id): bool => ($mine[$id]['status'] ?? null) === 'active'));
    }

    /** A trava do progresso: só quem está matriculado registra conclusões no curso. */
    public function assertEnrolled(string $courseId): void
    {
        if (($this->repo->find($this->tenant->userId, $courseId)['status'] ?? null) !== 'active') {
            throw new EnrollmentRejected('NOT_ENROLLED', 403);
        }
    }

    private function cohortFor(string $courseId, DateTimeImmutable $now): int
    {
        $cohorts = $this->repo->cohorts($courseId);
        $open = CohortPicker::open($cohorts, $now);
        if ($open !== null) {
            return $open['id'];
        }
        foreach ($cohorts as $c) {
            if ($c['slug'] === CohortPicker::DEFAULT_SLUG) {
                return $c['id'];
            }
        }
        return $this->repo->createCohort($courseId, CohortPicker::DEFAULT_SLUG, '1970-01-01 00:00:00', null);
    }

    /** @return array{status: string, cohort: ?string} */
    private function state(string $courseId): array
    {
        $mine = $this->repo->ofUser($this->tenant->userId)[$courseId];
        return ['status' => $mine['status'], 'cohort' => $mine['cohort']];
    }

    private function requireAdmin(): void
    {
        if (!$this->tenant->isAdmin()) {
            throw new EnrollmentRejected('FORBIDDEN', 403);
        }
    }
}
