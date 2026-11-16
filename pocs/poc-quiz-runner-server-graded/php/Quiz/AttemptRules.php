<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * A nota e a regra das tentativas (o mesmo src/quiz.ts; os casos de cases/ provam os dois lados iguais). A nota é
 * tudo ou nada por questão, em inteiros, e a aprovação não arredonda para cima. A tentativa aberta continua (não dá para
 * sortear de novo até achar questões fáceis); a reprovada espera; o limite de tentativas vale para todas.
 */
final class AttemptRules
{
    public static function score(int $correct, int $total): int
    {
        return $total > 0 ? intdiv($correct * 100, $total) : 0;
    }

    public static function passing(int $correct, int $total, int $passPercent): bool
    {
        return $total > 0 && $correct * 100 >= $passPercent * $total;
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
