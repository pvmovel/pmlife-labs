<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * A correção de um formato de questão (Strategy): diz se a resposta está toda certa (tudo ou nada, decisão do Pablo).
 * Um formato novo é uma classe nova registrada em {@see Graders::for}, sem mexer nas outras.
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
            default => throw new \InvalidArgumentException("formato desconhecido: {$kind}"),
        };
    }

    /** Corrige: a resposta precisa ter o formato certo e estar toda certa. */
    public static function grade(string $kind, array $content, array $answer, mixed $response): bool
    {
        $g = self::for($kind);
        return $g->valid($content, $response) && $g->correct($answer, $response);
    }
}
