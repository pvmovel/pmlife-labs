<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use DateTimeImmutable;

/** Port: as regras, as turmas e as matrículas da instituição da sessão (nenhum método recebe o tenant). */
interface EnrollmentRepository
{
    /** @return array{method: string, code_hash: ?string}|null */
    public function rule(string $courseId): ?array;

    /** @return array<string, string> curso => método, dos cursos com regra */
    public function methods(): array;

    public function saveRule(string $courseId, string $method, ?string $codeHash, DateTimeImmutable $now): void;

    /** @return list<array{id: int, slug: string, starts_at: string, ends_at: ?string}> */
    public function cohorts(string $courseId): array;

    public function createCohort(string $courseId, string $slug, string $startsAt, ?string $endsAt): int;

    /** @return array{status: string, cohort_id: ?int}|null */
    public function find(int $userId, string $courseId): ?array;

    /** @return array<string, array{status: string, cohort: ?string}> curso => estado, do aluno */
    public function ofUser(int $userId): array;

    public function save(int $userId, string $courseId, string $status, ?int $cohortId, DateTimeImmutable $now, bool $decided): void;

    /** @return list<array{userId: int, courseId: string, requestedAt: string}> */
    public function pending(): array;
}
