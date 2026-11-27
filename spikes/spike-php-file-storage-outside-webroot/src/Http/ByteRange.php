<?php
declare(strict_types=1);

namespace Spike\Files\Http;

/**
 * O cabeçalho Range (RFC 9110, seção 14), só com um trecho em bytes, que é o que o <audio> e os leitores de PDF pedem:
 *   bytes=a-b  ➔ de a até b (b além do fim vira o último byte)
 *   bytes=a-   ➔ de a até o fim
 *   bytes=-n   ➔ os últimos n bytes
 * Sem o cabeçalho, com outra unidade, com sintaxe inválida ou com vários trechos: o arquivo inteiro (200), como a RFC
 * permite. Um trecho que começa depois do fim: 416.
 */
final class ByteRange
{
    public const FULL = 'full';
    public const UNSATISFIABLE = 'unsatisfiable';

    /** @return self::FULL|self::UNSATISFIABLE|array{0: int, 1: int} */
    public static function parse(?string $header, int $size): string|array
    {
        if ($header === null || preg_match('/^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i', $header, $m) !== 1) {
            return self::FULL;
        }
        [$first, $last] = [$m[1], $m[2]];
        if ($first === '' && $last === '') {
            return self::FULL;
        }
        if (strlen($first) > 18 || strlen($last) > 18) {
            return $first === '' ? [0, $size - 1] : self::UNSATISFIABLE; // número enorme: além de qualquer arquivo
        }
        if ($first === '') {
            $suffix = (int) $last;
            if ($suffix === 0 || $size === 0) {
                return self::UNSATISFIABLE;
            }
            return [max(0, $size - $suffix), $size - 1];
        }
        $start = (int) $first;
        if ($start >= $size) {
            return self::UNSATISFIABLE;
        }
        if ($last === '') {
            return [$start, $size - 1];
        }
        $end = (int) $last;
        if ($end < $start) {
            return self::FULL;
        }
        return [$start, min($end, $size - 1)];
    }
}
