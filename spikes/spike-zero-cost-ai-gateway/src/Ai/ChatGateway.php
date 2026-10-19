<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Orquestra o pedido: valida ➔ rate limit (antes de qualquer chamada à IA) ➔ monta o prompt com a persona
 * do servidor e os trechos ➔ provedor (com failover). Devolve [status HTTP, corpo do envelope].
 */
final class ChatGateway
{
    /** @param array<string, string> $personas nome => system prompt */
    public function __construct(
        private array $personas,
        private RateLimiter $limiter,
        private AiProvider $provider,
        private int $maxTokens = 600,
        private ?\Closure $log = null,
    ) {
    }

    /** @return array{0: int, 1: array<string, mixed>} */
    public function handle(string $method, string $rawBody, string $ip, \DateTimeImmutable $now): array
    {
        if ($method !== 'POST') {
            return [405, ['status' => 'error', 'error' => ['code' => 'METHOD_NOT_ALLOWED']]];
        }
        try {
            $req = ChatRequest::fromJson($rawBody, array_keys($this->personas));
        } catch (\InvalidArgumentException $e) {
            $this->log('INVALID_REQUEST: ' . $e->getMessage());
            return [400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]];
        }
        if (!$this->limiter->allow($ip, $now)) {
            return [429, ['status' => 'error', 'error' => ['code' => 'RATE_LIMITED']]];
        }
        $user = ($req->context ? "Trechos do material:\n" . implode("\n", array_map(
            static fn (string $c, int $i): string => '[' . ($i + 1) . '] ' . $c,
            $req->context,
            array_keys($req->context)
        )) . "\n\n" : '') . 'Pergunta: ' . $req->message;
        try {
            $answer = $this->provider->complete($this->personas[$req->persona], $user, $this->maxTokens);
        } catch (AiUnavailable $e) {
            $this->log('AI_UNAVAILABLE: ' . $e->getMessage());
            return [503, ['status' => 'error', 'error' => ['code' => 'AI_UNAVAILABLE']]];
        }
        $by = $this->provider instanceof FailoverProvider ? $this->provider->lastProvider : $this->provider->name();
        return [200, ['status' => 'success', 'data' => ['answer' => $answer, 'provider' => $by]]];
    }

    private function log(string $msg): void
    {
        if ($this->log) {
            ($this->log)($msg);
        }
    }
}
