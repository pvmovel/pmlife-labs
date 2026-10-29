<?php
// (A mesma classe da lib PHP do PMLife, US30.)

declare(strict_types=1);

namespace Spike\Reset\Auth;


/** Contadores por chave e janela (o LoginThrottle não sabe se estão num array ou numa tabela). */
interface ThrottleStore
{
    /** Soma 1 e devolve o total da janela. */
    public function hit(string $bucket, int $window): int;

    /** @param list<int> $windows */
    public function count(string $bucket, array $windows): int;

    public function clear(string $bucket): void;
}
