<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Contadores por janela de tempo. */
interface RateLimitStore
{
    /** Soma 1 ao contador de (chave, janela) e devolve o total da janela. */
    public function hit(string $key, string $window): int;

    /**
     * Apaga as janelas (por minuto e por dia) com data anterior a $date ("AAAA-MM-DD"), chamado pelo Cron diário.
     * Compara só a data: "m:2026-10-18T14:05" e "d:2026-10-18" têm a data a partir do 3º caractere.
     */
    public function purgeBefore(string $date): int;
}
