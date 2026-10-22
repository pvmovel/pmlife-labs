<?php
declare(strict_types=1);

namespace Spike\Auth\Tenant;

use DateTimeImmutable;
use PDO;

/** Progresso do aluno (dado de exemplo com escopo de tenant). Todo SQL passa pelo run() da base. */
final class ProgressRepository extends TenantScopedRepository
{
    public function add(string $questId, int $xp, DateTimeImmutable $now): int
    {
        // tenant_id é a 1ª coluna e recebe :tenant_id (a trava da base confere): o valor gravado é o tenant da sessão.
        $insert = 'INSERT INTO progress_events (tenant_id, user_id, quest_id, xp, created_at) VALUES (:tenant_id, :user_id, :quest_id, :xp, :created_at)';
        $params = ['user_id' => $this->tenant->userId, 'quest_id' => $questId, 'xp' => $xp, 'created_at' => $now->format('Y-m-d H:i:s')];
        if ($this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql') {
            return (int) $this->run("{$insert} RETURNING id", $params)->fetchColumn();
        }
        $this->run($insert, $params);
        return (int) $this->pdo->lastInsertId();
    }

    /** @return list<array{id: int, questId: string, xp: int}> */
    public function mine(): array
    {
        $rows = $this->run(
            'SELECT id, quest_id, xp FROM progress_events WHERE tenant_id = :tenant_id AND user_id = :user_id ORDER BY id',
            ['user_id' => $this->tenant->userId],
        )->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'questId' => (string) $r['quest_id'], 'xp' => (int) $r['xp']], $rows);
    }

    /** Um registro pelo ID, só se for do tenant e do aluno da sessão (adivinhar o ID de outro cliente dá null). */
    public function find(int $id): ?array
    {
        $row = $this->run(
            'SELECT id, quest_id, xp FROM progress_events WHERE tenant_id = :tenant_id AND user_id = :user_id AND id = :id',
            ['user_id' => $this->tenant->userId, 'id' => $id],
        )->fetch(PDO::FETCH_ASSOC);
        return $row ? ['id' => (int) $row['id'], 'questId' => (string) $row['quest_id'], 'xp' => (int) $row['xp']] : null;
    }

    /** Resumo do cliente, só para o admin do tenant: total de XP e de alunos com progresso. */
    public function tenantSummary(): array
    {
        if (!$this->tenant->isAdmin()) {
            throw new \DomainException('FORBIDDEN');
        }
        $row = $this->run(
            'SELECT COALESCE(SUM(xp), 0) AS xp, COUNT(DISTINCT user_id) AS students FROM progress_events WHERE tenant_id = :tenant_id',
        )->fetch(PDO::FETCH_ASSOC);
        return ['xp' => (int) $row['xp'], 'students' => (int) $row['students']];
    }
}
