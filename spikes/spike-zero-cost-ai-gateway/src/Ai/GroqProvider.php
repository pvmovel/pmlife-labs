<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Groq (API compatível com a da OpenAI). Modelo e chave vêm do env.
 * O Llama saiu do free tier em 16/08/2026: o padrão é o gpt-oss-20b, um modelo de raciocínio.
 */
final class GroqProvider implements AiProvider
{
    public function __construct(
        private HttpClient $http,
        private string $apiKey,
        private string $model,
        private string $baseUrl = 'https://api.groq.com/openai/v1',
        private int $timeout = 12,
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
        $body = [
            'model' => $this->model,
            'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
            'max_completion_tokens' => $maxTokens,
            'temperature' => 0.3,
        ];
        if (str_starts_with($this->model, 'openai/gpt-oss')) {
            // Modelo de raciocínio: pensa pouco (mais rápido e gasta menos tokens) e não devolve o raciocínio,
            // só a resposta final em message.content.
            $body['reasoning_effort'] = 'low';
            $body['include_reasoning'] = false;
        }
        $res = $this->http->postJson(rtrim($this->baseUrl, '/') . '/chat/completions', ['Authorization' => 'Bearer ' . $this->apiKey], $body, $this->timeout);
        if ($res['status'] !== 200) {
            throw new AiUnavailable(ProviderError::describe('groq', $res));
        }
        $text = json_decode($res['body'], true)['choices'][0]['message']['content'] ?? '';
        if (!is_string($text) || trim($text) === '') {
            throw new AiUnavailable('groq: resposta sem texto');
        }
        return trim($text);
    }
}
