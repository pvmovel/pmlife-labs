<?php
declare(strict_types=1);

namespace Spike\Cohort;

use PDO;
use RuntimeException;

/** Um limite recusado (o código vai para o envelope de erro da API). */
final class LimitRejected extends RuntimeException
{
    public function __construct(public readonly string $reason)
    {
        parent::__construct($reason);
    }
}

/**
 * A matrícula com o limite da turma (US48), sobre o desenho da US44: o aluno entra na turma aberta, ou a seguinte é
 * criada. Tudo com o escopo da instituição (tenant_id) e numa transação que trava a linha do curso em
 * cc_course_cohort_settings: duas matrículas ao mesmo tempo esperam uma pela outra, e a segunda já vê a vaga ocupada.
 * O nível de isolamento é READ COMMITTED nos dois bancos, para a contagem depois da trava ler o que a outra gravou.
 */
final class CohortEnrollment
{
    private readonly string $driver;

    public function __construct(private readonly PDO $pdo, private readonly int $tenantId)
    {
        $this->driver = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    }

    /** O master da plataforma define o teto da instituição (múltiplo de 4, de 4 a 48). */
    public static function setCeiling(PDO $pdo, int $tenantId, int $ceiling): void
    {
        $problem = CohortCapacity::limitProblem($ceiling);
        if ($problem !== null) {
            throw new LimitRejected($problem);
        }
        $pdo->prepare('UPDATE cc_tenants SET cohort_ceiling = ? WHERE id = ?')->execute([$ceiling, $tenantId]);
    }

    public function ceiling(): int
    {
        $st = $this->pdo->prepare('SELECT cohort_ceiling FROM cc_tenants WHERE id = ?');
        $st->execute([$this->tenantId]);
        return (int) $st->fetchColumn();
    }

    /** A instituição escolhe o limite do curso: múltiplo de 4 e até o teto dela. */
    public function setCourseLimit(string $courseId, int $limit): void
    {
        $problem = CohortCapacity::limitProblem($limit, $this->ceiling());
        if ($problem !== null) {
            throw new LimitRejected($problem);
        }
        $this->ensureSettings($courseId);
        $this->pdo->prepare('UPDATE cc_course_cohort_settings SET cohort_size = ? WHERE tenant_id = ? AND course_id = ?')->execute([$limit, $this->tenantId, $courseId]);
    }

    /**
     * Matricula o aluno na turma aberta do curso, ou na seguinte (criada aqui).
     *
     * @param bool $lock   sem a trava (só o verify usa false), para mostrar a corrida que ela evita
     * @param int  $holdMs uma pausa entre ler as vagas e gravar (só o verify), para as duas matrículas se cruzarem
     * @return string a turma (slug)
     */
    public function enroll(int $userId, string $courseId, string $now, bool $lock = true, int $holdMs = 0): string
    {
        if ($this->driver === 'mysql') {
            $this->pdo->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        }
        $this->pdo->beginTransaction();
        try {
            if ($this->driver === 'pgsql') {
                $this->pdo->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
            }
            // Primeiro a trava; só se a linha do curso ainda não existe, ela é criada e travada. (No MySQL, um INSERT
            // IGNORE numa linha que existe pega uma trava compartilhada: dois pedidos assim, depois o FOR UPDATE, fariam
            // um deadlock.)
            $courseLimit = $this->lockedLimit($courseId, $lock);
            if ($courseLimit === null) {
                $this->ensureSettings($courseId);
                $courseLimit = (int) $this->lockedLimit($courseId, $lock);
            }
            $choice = CohortCapacity::choose($this->cohorts($courseId), $now, $courseLimit, $this->ceiling());
            if ($holdMs > 0) {
                usleep($holdMs * 1000);
            }
            if ($choice['kind'] === 'existing') {
                $cohortId = $choice['id'];
            } else {
                $this->pdo->prepare('INSERT INTO cc_cohorts (tenant_id, course_id, slug, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?, NULL, ?)')
                    ->execute([$this->tenantId, $courseId, $choice['slug'], $now, $choice['capacity']]);
                $cohortId = $this->cohortId($courseId, $choice['slug']);
            }
            $this->pdo->prepare("INSERT INTO cc_enrollments (tenant_id, user_id, course_id, status, cohort_id, requested_at, staff) VALUES (?, ?, ?, 'active', ?, ?, 0)")
                ->execute([$this->tenantId, $userId, $courseId, $cohortId, $now]);
            $this->pdo->commit();
            return $choice['slug'];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** A matrícula de equipe (o master): sem turma e sem ocupar vaga. */
    public function enrollStaff(int $userId, string $courseId, string $now): void
    {
        $this->pdo->prepare("INSERT INTO cc_enrollments (tenant_id, user_id, course_id, status, cohort_id, requested_at, staff) VALUES (?, ?, ?, 'active', NULL, ?, 1)")
            ->execute([$this->tenantId, $userId, $courseId, $now]);
    }

    /**
     * As turmas do curso, com quantos alunos ativos cada uma tem (a equipe não conta).
     *
     * @return list<array{id: int, slug: string, startsAt: string, endsAt: ?string, capacity: int, enrolled: int}>
     */
    public function cohorts(string $courseId): array
    {
        $st = $this->pdo->prepare(
            "SELECT c.id, c.slug, c.starts_at, c.ends_at, c.capacity,
                    (SELECT COUNT(*) FROM cc_enrollments e
                      WHERE e.tenant_id = c.tenant_id AND e.cohort_id = c.id AND e.status = 'active' AND e.staff = 0) AS enrolled
               FROM cc_cohorts c WHERE c.tenant_id = ? AND c.course_id = ? ORDER BY c.id"
        );
        $st->execute([$this->tenantId, $courseId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'slug' => (string) $r['slug'],
            'startsAt' => substr((string) $r['starts_at'], 0, 19),
            'endsAt' => $r['ends_at'] === null ? null : substr((string) $r['ends_at'], 0, 19),
            'capacity' => (int) $r['capacity'],
            'enrolled' => (int) $r['enrolled'],
        ], $st->fetchAll(PDO::FETCH_ASSOC));
    }

    private function lockedLimit(string $courseId, bool $lock): ?int
    {
        $st = $this->pdo->prepare('SELECT cohort_size FROM cc_course_cohort_settings WHERE tenant_id = ? AND course_id = ?' . ($lock ? ' FOR UPDATE' : ''));
        $st->execute([$this->tenantId, $courseId]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int) $v;
    }

    /** A linha do curso (o limite e a trava). Se faltar, nasce com o teto da instituição (no máximo o padrão, 12). */
    private function ensureSettings(string $courseId): void
    {
        $size = min(CohortCapacity::DEFAULT, $this->ceiling());
        $sql = $this->driver === 'pgsql'
            ? 'INSERT INTO cc_course_cohort_settings (tenant_id, course_id, cohort_size) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
            : 'INSERT IGNORE INTO cc_course_cohort_settings (tenant_id, course_id, cohort_size) VALUES (?, ?, ?)';
        $this->pdo->prepare($sql)->execute([$this->tenantId, $courseId, $size]);
    }

    private function cohortId(string $courseId, string $slug): int
    {
        $st = $this->pdo->prepare('SELECT id FROM cc_cohorts WHERE tenant_id = ? AND course_id = ? AND slug = ?');
        $st->execute([$this->tenantId, $courseId, $slug]);
        return (int) $st->fetchColumn();
    }
}
