<?php
declare(strict_types=1);

// O lado do servidor da sincronização: lê as conclusões do aluno (sempre filtradas pela instituição), aplica a fila
// pelas regras do documento do curso e grava só o que foi aceito, com a versão decidida aqui.

namespace Spike\Progression;

use PDO;

/** A porta: onde ficam as conclusões. */
interface CompletionStore
{
    /** @return list<array{questId: string, version: int}> */
    public function completions(int $tenantId, int $userId, string $courseId): array;

    /** @param array{questId: string, version: int} $completion */
    public function add(int $tenantId, int $userId, string $courseId, array $completion, string $at): void;
}

final class PdoCompletionStore implements CompletionStore
{
    public function __construct(private PDO $pdo)
    {
    }

    public function completions(int $tenantId, int $userId, string $courseId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT quest_id, course_version FROM quest_completions
             WHERE tenant_id = :tenant_id AND user_id = :user_id AND track_id = :course ORDER BY completed_at, quest_id'
        );
        $stmt->execute(['tenant_id' => $tenantId, 'user_id' => $userId, 'course' => $courseId]);
        return array_map(
            static fn (array $r) => ['questId' => (string) $r['quest_id'], 'version' => (int) $r['course_version']],
            $stmt->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function add(int $tenantId, int $userId, string $courseId, array $completion, string $at): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO quest_completions (tenant_id, user_id, track_id, quest_id, course_version, completed_at, created_at)
             VALUES (:tenant_id, :user_id, :course, :quest, :version, :at, :at2)'
        );
        $stmt->execute([
            'tenant_id' => $tenantId, 'user_id' => $userId, 'course' => $courseId,
            'quest' => $completion['questId'], 'version' => $completion['version'], 'at' => $at, 'at2' => $at,
        ]);
    }
}

final class ProgressService
{
    public function __construct(private CompletionStore $store)
    {
    }

    /**
     * @param array<int, array> $history as versões publicadas do curso
     * @param list<string> $queue os ids que o aparelho enviou (a versão é decidida aqui)
     */
    public function sync(int $tenantId, int $userId, array $history, array $queue, string $at): array
    {
        $courseId = $history[max(array_keys($history))]['courseId'];
        $server = new CourseProgress($history, $this->store->completions($tenantId, $userId, $courseId));
        $result = OfflineSync::applyQueue($server, $queue);
        foreach ($result['accepted'] as $completion) {
            $this->store->add($tenantId, $userId, $courseId, $completion, $at);
        }
        return $result;
    }
}
