<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * A correção de um formato de questão (Strategy): diz se a resposta está toda certa (tudo ou nada, decisão do Pablo).
 * Um formato novo é uma classe nova registrada em {@see Graders::for}, sem mexer nas outras (a US59 acrescentou a
 * questão em 2 etapas assim).
 */
interface Grader
{
    /** O formato da resposta está certo (os ids existem na questão)? Uma resposta malformada vale como errada. */
    public function valid(array $content, mixed $response): bool;

    /** A resposta está toda certa? */
    public function correct(array $answer, array $response): bool;
}

final class SingleGrader implements Grader
{
    public function valid(array $content, mixed $response): bool
    {
        return is_array($response) && is_string($response['option'] ?? null) && in_array($response['option'], array_column($content['options'], 'id'), true);
    }

    public function correct(array $answer, array $response): bool
    {
        return $response['option'] === $answer['option'];
    }
}

final class MultipleGrader implements Grader
{
    public function valid(array $content, mixed $response): bool
    {
        $ids = array_column($content['options'], 'id');
        $picked = is_array($response) ? ($response['options'] ?? null) : null;
        return is_array($picked) && array_is_list($picked) && count(array_unique($picked)) === count($picked)
            && array_filter($picked, static fn ($p): bool => !is_string($p) || !in_array($p, $ids, true)) === [];
    }

    public function correct(array $answer, array $response): bool
    {
        $a = $answer['options'];
        $r = $response['options'];
        sort($a);
        sort($r);
        return $a === $r;
    }
}

final class TrueFalseGrader implements Grader
{
    public function valid(array $content, mixed $response): bool
    {
        return is_array($response) && is_bool($response['value'] ?? null);
    }

    public function correct(array $answer, array $response): bool
    {
        return $response['value'] === $answer['value'];
    }
}

final class ClozeGrader implements Grader
{
    public function valid(array $content, mixed $response): bool
    {
        $blanks = is_array($response) ? ($response['blanks'] ?? null) : null;
        if (!is_array($blanks) || array_keys($blanks) != array_keys($content['blanks'])) {
            return false;
        }
        foreach ($content['blanks'] as $key => $choices) {
            if (!is_string($blanks[$key] ?? null) || !in_array($blanks[$key], $choices, true)) {
                return false;
            }
        }
        return true;
    }

    public function correct(array $answer, array $response): bool
    {
        foreach ($answer['blanks'] as $key => $value) {
            if (($response['blanks'][$key] ?? null) !== $value) {
                return false;
            }
        }
        return true;
    }
}

final class OrderingGrader implements Grader
{
    public function valid(array $content, mixed $response): bool
    {
        $order = is_array($response) ? ($response['order'] ?? null) : null;
        $ids = array_column($content['items'], 'id');
        if (!is_array($order) || !array_is_list($order)) {
            return false;
        }
        $sorted = $order;
        sort($sorted);
        sort($ids);
        return $sorted === $ids;
    }

    public function correct(array $answer, array $response): bool
    {
        return $response['order'] === $answer['order'];
    }
}

/**
 * A correção com crédito parcial e por etapa (US59). A questão em 2 etapas é uma estratégia a mais (OCP): reaproveita a
 * correção da 1ª etapa (escolha única ou verdadeiro ou falso) e acrescenta o porquê, sem mexer nas outras.
 */
interface PartialGrader extends Grader
{
    /** @return array{credit: float, steps: array{answer: bool, reason: bool}} o crédito e o acerto de cada etapa */
    public function credit(array $content, array $answer, array $response): array;
}

final class TwoStepGrader implements PartialGrader
{
    /** Formatos que podem ser a 1ª etapa (decisão do Pablo, 2026-11-18). */
    public const FIRST = ['single', 'truefalse'];

    public function valid(array $content, mixed $response): bool
    {
        return in_array($content['first'] ?? null, self::FIRST, true)
            && Graders::for($content['first'])->valid($content, $response)
            && is_string($response['reason'] ?? null)
            && in_array($response['reason'], array_column($content['reasons'], 'id'), true);
    }

    /** As duas etapas certas (a questão inteira). */
    public function correct(array $answer, array $response): bool
    {
        return self::answerRight($answer, $response) && $response['reason'] === $answer['reason'];
    }

    public function credit(array $content, array $answer, array $response): array
    {
        $answerRight = self::answerRight($answer, $response);
        $reasonRight = $response['reason'] === $answer['reason'];
        return [
            'credit' => AttemptRules::twoStepCredit($answerRight, $reasonRight, ($content['halfCredit'] ?? false) === true),
            'steps' => ['answer' => $answerRight, 'reason' => $reasonRight],
        ];
    }

    /** A 1ª etapa certa: o gabarito diz o formato dela (`option` na escolha única, `value` no verdadeiro ou falso). */
    private static function answerRight(array $answer, array $response): bool
    {
        return array_key_exists('option', $answer)
            ? (new SingleGrader())->correct($answer, $response)
            : (new TrueFalseGrader())->correct($answer, $response);
    }
}

final class Graders
{
    public static function for(string $kind): Grader
    {
        return match ($kind) {
            'single' => new SingleGrader(),
            'multiple' => new MultipleGrader(),
            'truefalse' => new TrueFalseGrader(),
            'cloze' => new ClozeGrader(),
            'ordering' => new OrderingGrader(),
            'twostep' => new TwoStepGrader(),
            default => throw new \InvalidArgumentException("formato desconhecido: {$kind}"),
        };
    }

    /**
     * Corrige: o crédito da questão (1, 0,5 ou 0) e, na questão em 2 etapas, o acerto de cada etapa. Uma resposta fora
     * do formato vale 0 (e, em 2 etapas, as duas etapas erradas).
     *
     * @return array{credit: float, steps?: array{answer: bool, reason: bool}}
     */
    public static function score(string $kind, array $content, array $answer, mixed $response): array
    {
        $g = self::for($kind);
        if (!$g->valid($content, $response)) {
            return ['credit' => 0.0] + ($g instanceof PartialGrader ? ['steps' => ['answer' => false, 'reason' => false]] : []);
        }
        return $g instanceof PartialGrader ? $g->credit($content, $answer, $response) : ['credit' => $g->correct($answer, $response) ? 1.0 : 0.0];
    }

    /** A questão vale inteira? (a resposta no formato certo e toda certa). */
    public static function grade(string $kind, array $content, array $answer, mixed $response): bool
    {
        return self::score($kind, $content, $answer, $response)['credit'] === 1.0;
    }
}
