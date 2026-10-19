<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Entrada do chat: { persona, message, context[] }. Qualquer outro campo (inclusive "system") é IGNORADO:
 * o system prompt é sempre o da persona, resolvido no servidor.
 */
final class ChatRequest
{
    public const MAX_MESSAGE = 500;
    public const MAX_CONTEXT_ITEMS = 4;
    public const MAX_CONTEXT_CHARS = 700;

    /** @param list<string> $context */
    private function __construct(public string $persona, public string $message, public array $context)
    {
    }

    /** @throws \InvalidArgumentException com o motivo (só para log; o cliente recebe INVALID_REQUEST) */
    public static function fromJson(string $raw, array $personas): self
    {
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new \InvalidArgumentException('JSON inválido');
        }
        $persona = $data['persona'] ?? null;
        if (!is_string($persona) || !in_array($persona, $personas, true)) {
            throw new \InvalidArgumentException('persona desconhecida');
        }
        $message = is_string($data['message'] ?? null) ? trim($data['message']) : '';
        if ($message === '' || mb_strlen($message) > self::MAX_MESSAGE) {
            throw new \InvalidArgumentException('message vazia ou longa demais');
        }
        $context = $data['context'] ?? [];
        if (!is_array($context) || count($context) > self::MAX_CONTEXT_ITEMS) {
            throw new \InvalidArgumentException('context inválido');
        }
        foreach ($context as $c) {
            if (!is_string($c) || mb_strlen($c) > self::MAX_CONTEXT_CHARS) {
                throw new \InvalidArgumentException('trecho de context inválido');
            }
        }
        return new self($persona, $message, array_values($context));
    }
}
