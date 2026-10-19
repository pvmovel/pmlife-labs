<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Groq (API compatível com a da OpenAI). Modelo e chave vêm do env. */
final class GroqProvider implements AiProvider
{
    public function __construct(
        private HttpClient $http,
        private string $apiKey,
        private string $model,
        private string $baseUrl = 'https://api.groq.com/openai/v1',
        private int $timeout = 20,
    ) {
    }

    public function name(): string
    {
        return 'groq';
    }

    public function complete(string $system, string $user, int $maxTokens): string
    {
        if ($this->apiKey === '') {
            throw new AiUnavailable('groq: sem chave');
        }
        $res = $this->http->postJson(rtrim($this->baseUrl, '/') . '/chat/completions', ['Authorization' => 'Bearer ' . $this->apiKey], [
            'model' => $this->model,
            'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
            'max_tokens' => $maxTokens,
            'temperature' => 0.3,
        ], $this->timeout);
        if ($res['status'] !== 200) {
            throw new AiUnavailable("groq: HTTP {$res['status']}");
        }
        $text = json_decode($res['body'], true)['choices'][0]['message']['content'] ?? '';
        if (!is_string($text) || trim($text) === '') {
            throw new AiUnavailable('groq: resposta sem texto');
        }
        return trim($text);
    }
}
