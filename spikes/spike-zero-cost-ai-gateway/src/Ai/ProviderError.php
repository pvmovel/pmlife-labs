<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Monta a mensagem de falha para o LOG do servidor (o cliente só recebe AI_UNAVAILABLE). Nunca inclui chave. */
final class ProviderError
{
    /** @param array{status: int, body: string, error?: string} $res */
    public static function describe(string $provider, array $res): string
    {
        if ($res['status'] === 0) {
            return "{$provider}: " . ($res['error'] ?? 'sem resposta');
        }
        // Código curto em texto do corpo do erro: Groq/OpenAI usa error.code ("model_not_found");
        // o Google usa error.status ("RESOURCE_EXHAUSTED"), e o error.code dele é o número HTTP repetido.
        $err = json_decode($res['body'], true)['error'] ?? [];
        $code = '';
        foreach (['code', 'status'] as $field) {
            if (is_array($err) && is_string($err[$field] ?? null)) {
                $code = preg_replace('/[^A-Za-z0-9_.-]/', '', $err[$field]);
                break;
            }
        }
        return "{$provider}: HTTP {$res['status']}" . ($code !== '' ? " {$code}" : '');
    }
}
