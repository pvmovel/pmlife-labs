<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * A nota e a regra das tentativas (o mesmo src/quiz.ts; os casos de cases/ provam os dois lados iguais). A nota é
 * tudo ou nada por questão, menos na questão em 2 etapas com meio ponto (US59): a conta é feita em meios pontos
 * inteiros, e a aprovação não arredonda para cima. A tentativa aberta continua (não dá para sortear de novo até achar
 * questões fáceis); a reprovada espera; o limite de tentativas vale para todas.
 */
final class AttemptRules
{
    /** A nota em porcentagem, sem casas; `$points` é a soma dos créditos (4,5 de 5 = 90). */
    public static function score(int|float $points, int $total): int
    {
        return $total > 0 ? intdiv(self::halves($points) * 100, $total * 2) : 0;
    }

    public static function passing(int|float $points, int $total, int $passPercent): bool
    {
        return $total > 0 && self::halves($points) * 100 >= $passPercent * $total * 2;
    }

    /**
     * O crédito da questão em 2 etapas: 1 só com as duas certas; com o meio ponto, só a resposta certa vale 0,5; o
     * porquê certo com a resposta errada vale 0.
     */
    public static function twoStepCredit(bool $answerRight, bool $reasonRight, bool $halfCredit): float
    {
        if ($answerRight && $reasonRight) {
            return 1.0;
        }
        return $answerRight && $halfCredit ? 0.5 : 0.0;
    }

    /** Os pontos em meios pontos inteiros (4,5 ➔ 9). */
    public static function halves(int|float $points): int
    {
        return (int) round($points * 2);
    }

    /**
     * @param list<array{startedAt: int, submittedAt: int|null, passed: bool|null}> $attempts
     * @param array{maxAttempts: int|null, cooldownSeconds: int} $policy
     * @return array{canStart: bool, reason: string, waitSeconds: int, remaining: int|null, passed: bool}
     */
    public static function gate(array $attempts, array $policy, int $now): array
    {
        $passed = false;
        $open = false;
        $last = null;
        foreach ($attempts as $a) {
            $passed = $passed || $a['passed'] === true;
            $open = $open || $a['submittedAt'] === null;
            if ($last === null || ($a['submittedAt'] ?? 0) >= ($last['submittedAt'] ?? 0)) {
                $last = $a;
            }
        }
        $remaining = $policy['maxAttempts'] === null ? null : max(0, $policy['maxAttempts'] - count($attempts));
        $gate = static fn (bool $can, string $reason, int $wait = 0): array => ['canStart' => $can, 'reason' => $reason, 'waitSeconds' => $wait, 'remaining' => $remaining, 'passed' => $passed];
        if ($open) {
            return $gate(true, 'open');
        }
        if ($remaining === 0) {
            return $gate(false, 'exhausted');
        }
        $until = $last !== null && $last['passed'] === false ? (int) $last['submittedAt'] + $policy['cooldownSeconds'] : 0;
        return $until > $now ? $gate(false, 'cooldown', $until - $now) : $gate(true, 'ok');
    }
}
