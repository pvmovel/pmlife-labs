<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use DateTimeImmutable;
use PDO;
use Spike\Enrollment\Tenant\TenantScopedRepository;

/** Adapter PDO: o mesmo SQL no MySQL 5.7 e no PostgreSQL 16; todo SQL com o filtro de tenant (TenantScopedRepository). */
final class PdoEnrollmentRepository extends TenantScopedRepository implements EnrollmentRepository
{
    public function rule(string $courseId): ?array
    {
        $r = $this->run('SELECT method, code_hash FROM course_enrollment_rules WHERE tenant_id = :tenant_id AND course_id = :course', ['course' => $courseId])->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : ['method' => (string) $r['method'], 'code_hash' => $r['code_hash'] === null ? null : (string) $r['code_hash']];
    }

    public function methods(): array
    {
        $rows = $this->run('SELECT course_id, method FROM course_enrollment_rules WHERE tenant_id = :tenant_id')->fetchAll(PDO::FETCH_ASSOC);
        return array_column($rows, 'method', 'course_id');
    }

    public function saveRule(string $courseId, string $method, ?string $codeHash, DateTimeImmutable $now): void
    {
        // Sem UPSERT de dialeto: apaga e grava na mesma transação.
        $this->pdo->beginTransaction();
        $this->run('DELETE FROM course_enrollment_rules WHERE tenant_id = :tenant_id AND course_id = :course', ['course' => $courseId]);
        $this->run(
            'INSERT INTO course_enrollment_rules (tenant_id, course_id, method, code_hash, updated_at) VALUES (:tenant_id, :course, :method, :hash, :now)',
            ['course' => $courseId, 'method' => $method, 'hash' => $codeHash, 'now' => $now->format('Y-m-d H:i:s')]
        );
        $this->pdo->commit();
    }

    public function cohorts(string $courseId): array
    {
        $rows = $this->run('SELECT id, slug, starts_at, ends_at FROM cohorts WHERE tenant_id = :tenant_id AND course_id = :course ORDER BY id', ['course' => $courseId])->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'slug' => (string) $r['slug'],
            'starts_at' => substr((string) $r['starts_at'], 0, 19), 'ends_at' => $r['ends_at'] === null ? null : substr((string) $r['ends_at'], 0, 19),
        ], $rows);
    }

    public function createCohort(string $courseId, string $slug, string $startsAt, ?string $endsAt): int
    {
        $this->run(
            'INSERT INTO cohorts (tenant_id, course_id, slug, starts_at, ends_at) VALUES (:tenant_id, :course, :slug, :starts, :ends)',
            ['course' => $courseId, 'slug' => $slug, 'starts' => $startsAt, 'ends' => $endsAt]
        );
        $id = $this->run('SELECT id FROM cohorts WHERE tenant_id = :tenant_id AND course_id = :course AND slug = :slug', ['course' => $courseId, 'slug' => $slug])->fetchColumn();
        return (int) $id;
    }

    public function find(int $userId, string $courseId): ?array
    {
        $r = $this->run('SELECT status, cohort_id FROM enrollments WHERE tenant_id = :tenant_id AND user_id = :user AND course_id = :course', ['user' => $userId, 'course' => $courseId])->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : ['status' => (string) $r['status'], 'cohort_id' => $r['cohort_id'] === null ? null : (int) $r['cohort_id']];
    }

    public function ofUser(int $userId): array
    {
        $rows = $this->run(
            'SELECT e.course_id, e.status, c.slug FROM enrollments e LEFT JOIN cohorts c ON c.id = e.cohort_id AND c.tenant_id = e.tenant_id'
            . ' WHERE e.tenant_id = :tenant_id AND e.user_id = :user ORDER BY e.course_id',
            ['user' => $userId]
        )->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[(string) $r['course_id']] = ['status' => (string) $r['status'], 'cohort' => $r['slug'] === null ? null : (string) $r['slug']];
        }
        return $out;
    }

    public function save(int $userId, string $courseId, string $status, ?int $cohortId, DateTimeImmutable $now, bool $decided): void
    {
        $at = $now->format('Y-m-d H:i:s');
        if ($this->find($userId, $courseId) === null) {
            $this->run(
                'INSERT INTO enrollments (tenant_id, user_id, course_id, status, cohort_id, requested_at, decided_at) VALUES (:tenant_id, :user, :course, :status, :cohort, :at, :decided)',
                ['user' => $userId, 'course' => $courseId, 'status' => $status, 'cohort' => $cohortId, 'at' => $at, 'decided' => $decided ? $at : null]
            );
            return;
        }
        $this->run(
            'UPDATE enrollments SET status = :status, cohort_id = :cohort, decided_at = :decided' . ($decided ? '' : ', requested_at = :at')
            . ' WHERE tenant_id = :tenant_id AND user_id = :user AND course_id = :course',
            ['user' => $userId, 'course' => $courseId, 'status' => $status, 'cohort' => $cohortId, 'decided' => $decided ? $at : null] + ($decided ? [] : ['at' => $at])
        );
    }

    public function pending(): array
    {
        $rows = $this->run("SELECT user_id, course_id, requested_at FROM enrollments WHERE tenant_id = :tenant_id AND status = 'pending' ORDER BY requested_at, user_id")->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static fn (array $r): array => ['userId' => (int) $r['user_id'], 'courseId' => (string) $r['course_id'], 'requestedAt' => substr((string) $r['requested_at'], 0, 19)], $rows);
    }
}
