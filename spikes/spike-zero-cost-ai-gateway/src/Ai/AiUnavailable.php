<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Nenhum provedor respondeu (cota, rede, chave inválida...). O cliente recebe só o código AI_UNAVAILABLE. */
final class AiUnavailable extends \RuntimeException
{
}
