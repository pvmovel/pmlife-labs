<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Um provedor de IA. O system prompt chega aqui já resolvido no servidor (nunca vem do cliente). */
interface AiProvider
{
    /** Nome curto para log e para a resposta (ex.: "gemini"). */
    public function name(): string;

    /**
     * @throws AiUnavailable quando o provedor falha (HTTP != 200, timeout, resposta sem texto).
     */
    public function complete(string $system, string $user, int $maxTokens): string;
}
