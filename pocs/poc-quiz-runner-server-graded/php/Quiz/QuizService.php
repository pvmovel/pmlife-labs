<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * O caso de uso do quiz no servidor:
 * - **abrir** sorteia N de X pela semente (ou devolve a tentativa aberta, com as mesmas questões) e manda as questões
 *   embaralhadas, sem o gabarito nem a justificativa;
 * - **enviar** refaz o sorteio pela semente, corrige cada questão sorteada pela estratégia do formato (tudo ou nada),
 *   fecha a tentativa uma vez só e diz se é a primeira aprovação (a que dá o XP; no produto, a missão concluída);
 * - a devolutiva diz certo ou errado e a justificativa, nunca a resposta certa (decisão do Pablo).
 * O aluno vem sempre da sessão, e o relógio é injetado (os testes andam no tempo).
 */
final class QuizService
{
    /** @param \Closure(): int $clock */
    public function __construct(private readonly QuizStore $store, private readonly \Closure $clock)
    {
    }

    /** @return array{quiz: array, gate: array, attempts: list<array>, best: int|null}|null */
    public function state(string $quizId, string $learner): ?array
    {
        $quiz = $this->store->quiz($quizId);
        if ($quiz === null) {
            return null;
        }
        $attempts = $this->store->attempts($quizId, $learner);
        $scores = array_filter(array_column($attempts, 'score'), static fn ($s): bool => $s !== null);
        return [
            'quiz' => ['id' => $quiz['id'], 'title' => $quiz['title'], 'drawCount' => $quiz['drawCount'], 'passPercent' => $quiz['passPercent'], 'maxAttempts' => $quiz['maxAttempts'], 'cooldownSeconds' => $quiz['cooldownSeconds'], 'rewardXp' => $quiz['rewardXp'], 'bank' => count($this->store->questionIds($quizId))],
            'gate' => $this->gate($quiz, $attempts),
            'attempts' => array_map(static fn (array $a): array => ['submitted' => $a['submittedAt'] !== null, 'score' => $a['score'], 'passed' => $a['passed']], $attempts),
            'best' => $scores === [] ? null : max($scores),
        ];
    }

    /**
     * @return array{ok: true, attemptId: int, resumed: bool, questions: list<array>}|array{ok: false, code: string, waitSeconds?: int}
     */
    public function start(string $quizId, string $learner): array
    {
        $quiz = $this->store->quiz($quizId);
        if ($quiz === null) {
            return ['ok' => false, 'code' => 'QUIZ_NOT_FOUND'];
        }
        $attempts = $this->store->attempts($quizId, $learner);
        $gate = $this->gate($quiz, $attempts);
        if (!$gate['canStart']) {
            return $gate['reason'] === 'cooldown' ? ['ok' => false, 'code' => 'QUIZ_COOLDOWN', 'waitSeconds' => $gate['waitSeconds']] : ['ok' => false, 'code' => 'QUIZ_NO_ATTEMPTS'];
        }
        $open = null;
        foreach ($attempts as $a) {
            if ($a['submittedAt'] === null) {
                $open = $a;
            }
        }
        $seed = $open['seed'] ?? Draw::seed();
        $id = $open['id'] ?? $this->store->open($quizId, $learner, $seed, ($this->clock)());
        $drawn = Draw::questions($seed, $this->store->questionIds($quizId), $quiz['drawCount']);
        $bank = $this->store->questions($quizId, $drawn);
        return ['ok' => true, 'attemptId' => $id, 'resumed' => $open !== null, 'questions' => array_map(static fn (int $qid): array => self::view($bank[$qid], $seed), $drawn)];
    }

    /**
     * @param array<string, mixed> $answers id da questão => resposta
     * @return array{ok: true, correct: int, total: int, score: int, passed: bool, firstPass: bool, xp: int, results: list<array>, gate: array}|array{ok: false, code: string}
     */
    public function submit(string $quizId, string $learner, int $attemptId, array $answers): array
    {
        $quiz = $this->store->quiz($quizId);
        $attempt = null;
        foreach ($quiz === null ? [] : $this->store->attempts($quizId, $learner) as $a) {
            if ($a['id'] === $attemptId) {
                $attempt = $a;
            }
        }
        if ($quiz === null || $attempt === null) {
            return ['ok' => false, 'code' => 'ATTEMPT_NOT_FOUND'];
        }
        if ($attempt['submittedAt'] !== null) {
            return ['ok' => false, 'code' => 'ATTEMPT_CLOSED'];
        }
        // A correção refaz o sorteio pela semente: só as questões sorteadas contam, e uma resposta a mais é ignorada.
        $drawn = Draw::questions($attempt['seed'], $this->store->questionIds($quizId), $quiz['drawCount']);
        $bank = $this->store->questions($quizId, $drawn);
        $results = [];
        $correct = 0;
        foreach ($drawn as $qid) {
            $q = $bank[$qid];
            $ok = Graders::grade($q['kind'], $q['content'], $q['answer'], $answers[(string) $qid] ?? null);
            $correct += $ok ? 1 : 0;
            $results[] = ['id' => $qid, 'correct' => $ok] + ($q['rationale'] !== null ? ['rationale' => $q['rationale']] : []);
        }
        $total = count($drawn);
        $passed = AttemptRules::passing($correct, $total, $quiz['passPercent']);
        $score = AttemptRules::score($correct, $total);
        if (!$this->store->close($attemptId, $learner, $correct, $score, $passed, ($this->clock)())) {
            return ['ok' => false, 'code' => 'ATTEMPT_CLOSED'];
        }
        // O XP uma vez só: na primeira aprovação (contada depois de fechar, para dois envios ao mesmo tempo não darem dois).
        $firstPass = $passed && $this->store->passedCount($quizId, $learner) === 1;
        return [
            'ok' => true, 'correct' => $correct, 'total' => $total, 'score' => $score, 'passed' => $passed, 'firstPass' => $firstPass,
            'xp' => $firstPass ? $quiz['rewardXp'] : 0, 'results' => $results, 'gate' => $this->gate($quiz, $this->store->attempts($quizId, $learner)),
        ];
    }

    private function gate(array $quiz, array $attempts): array
    {
        return AttemptRules::gate($attempts, ['maxAttempts' => $quiz['maxAttempts'], 'cooldownSeconds' => $quiz['cooldownSeconds']], ($this->clock)());
    }

    /** A questão como o navegador recebe: as alternativas, os itens e as opções das lacunas embaralhados; sem gabarito. */
    private static function view(array $q, int $seed): array
    {
        $base = ['id' => $q['id'], 'kind' => $q['kind'], 'prompt' => $q['prompt']];
        $c = $q['content'];
        $shuffle = static function (array $choices, string $tag) use ($seed): array {
            $byId = array_column($choices, null, 'id');
            return array_map(static fn ($id): array => $byId[$id], Draw::order($seed, $tag, array_keys($byId)));
        };
        return match ($q['kind']) {
            'single', 'multiple' => $base + ['options' => $shuffle($c['options'], "o{$q['id']}")],
            'ordering' => $base + ['items' => $shuffle($c['items'], "i{$q['id']}")],
            'cloze' => $base + ['text' => $c['text'], 'blanks' => array_map(
                static fn (array $choices, string $key): array => ['key' => $key, 'choices' => array_map('strval', Draw::order($seed, "b{$q['id']}{$key}", $choices))],
                $c['blanks'],
                array_map('strval', array_keys($c['blanks'])),
            )],
            default => $base,
        };
    }
}
