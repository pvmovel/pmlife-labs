<?php
declare(strict_types=1);

namespace Poc\Quiz;

use PDO;

/**
 * O repositório (PDO, só SQL do MySQL 5.7): o quiz, o banco de questões e as tentativas. Toda consulta de tentativa
 * leva o aluno (`learner`), que vem só da sessão: uma tentativa de outra pessoa não existe para quem pede.
 */
final class QuizStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{id: string, title: string, drawCount: int, passPercent: int, maxAttempts: int|null, cooldownSeconds: int, rewardXp: int}|null */
    public function quiz(string $id): ?array
    {
        $st = $this->pdo->prepare('SELECT id, title, draw_count, pass_percent, max_attempts, cooldown_seconds, reward_xp FROM poc_eq_quizzes WHERE id = ?');
        $st->execute([$id]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : [
            'id' => $r['id'], 'title' => $r['title'], 'drawCount' => (int) $r['draw_count'], 'passPercent' => (int) $r['pass_percent'],
            'maxAttempts' => $r['max_attempts'] === null ? null : (int) $r['max_attempts'], 'cooldownSeconds' => (int) $r['cooldown_seconds'], 'rewardXp' => (int) $r['reward_xp'],
        ];
    }

    /** @return list<int> os ids do banco de questões, em ordem */
    public function questionIds(string $quizId): array
    {
        $st = $this->pdo->prepare('SELECT id FROM poc_eq_questions WHERE quiz_id = ? ORDER BY id');
        $st->execute([$quizId]);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * As questões pedidas, com o gabarito (só o servidor usa).
     *
     * @param list<int> $ids
     * @return array<int, array{id: int, kind: string, prompt: string, content: array, answer: array, rationale: string|null}>
     */
    public function questions(string $quizId, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $st = $this->pdo->prepare('SELECT id, kind, prompt, content, answer, rationale FROM poc_eq_questions WHERE quiz_id = ? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $st->execute([$quizId, ...$ids]);
        $out = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $out[(int) $r['id']] = [
                'id' => (int) $r['id'], 'kind' => $r['kind'], 'prompt' => $r['prompt'],
                'content' => json_decode($r['content'], true, 16, JSON_THROW_ON_ERROR), 'answer' => json_decode($r['answer'], true, 16, JSON_THROW_ON_ERROR), 'rationale' => $r['rationale'],
            ];
        }
        return $out;
    }

    /** @return list<array{id: int, seed: int, startedAt: int, submittedAt: int|null, score: int|null, passed: bool|null}> */
    public function attempts(string $quizId, string $learner): array
    {
        $st = $this->pdo->prepare('SELECT id, seed, started_at, submitted_at, score, passed FROM poc_eq_attempts WHERE quiz_id = ? AND learner = ? ORDER BY id');
        $st->execute([$quizId, $learner]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'seed' => (int) $r['seed'], 'startedAt' => strtotime($r['started_at'] . ' UTC'),
            'submittedAt' => $r['submitted_at'] === null ? null : strtotime($r['submitted_at'] . ' UTC'),
            'score' => $r['score'] === null ? null : (int) $r['score'], 'passed' => $r['passed'] === null ? null : (bool) (int) $r['passed'],
        ], $st->fetchAll(PDO::FETCH_ASSOC));
    }

    public function open(string $quizId, string $learner, int $seed, int $now): int
    {
        $this->pdo->prepare('INSERT INTO poc_eq_attempts (quiz_id, learner, seed, started_at) VALUES (?, ?, ?, ?)')
            ->execute([$quizId, $learner, $seed, gmdate('Y-m-d H:i:s', $now)]);
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Fecha a tentativa aberta com a nota (os pontos em meios pontos inteiros: 4,5 ➔ 9); false se ela já foi enviada (o
     * segundo envio não conta).
     */
    public function close(int $attemptId, string $learner, int $halfPoints, int $score, bool $passed, int $now): bool
    {
        $st = $this->pdo->prepare('UPDATE poc_eq_attempts SET submitted_at = ?, half_points = ?, score = ?, passed = ? WHERE id = ? AND learner = ? AND submitted_at IS NULL');
        $st->execute([gmdate('Y-m-d H:i:s', $now), $halfPoints, $score, $passed ? 1 : 0, $attemptId, $learner]);
        return $st->rowCount() === 1;
    }

    /** Quantas tentativas aprovadas o aluno tem (a primeira dá o XP). */
    public function passedCount(string $quizId, string $learner): int
    {
        $st = $this->pdo->prepare('SELECT COUNT(*) FROM poc_eq_attempts WHERE quiz_id = ? AND learner = ? AND passed = 1');
        $st->execute([$quizId, $learner]);
        return (int) $st->fetchColumn();
    }

    /** A demo apaga as tentativas com mais de 1 dia. */
    public function purgeDemo(int $now): void
    {
        $this->pdo->prepare('DELETE FROM poc_eq_attempts WHERE started_at < ?')->execute([gmdate('Y-m-d H:i:s', $now - 86400)]);
    }
}
