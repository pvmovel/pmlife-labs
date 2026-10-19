<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Google Gemini (generateContent). Modelo e chave vêm do env; o padrão é um Flash-Lite do free tier. */
final class GeminiProvider implements AiProvider
{
    public function __construct(
        private HttpClient $http,
        private string $apiKey,
        private string $model,
        private string $baseUrl = 'https://generativelanguage.googleapis.com',
        private int $timeout = 20,
    ) {
    }

    public function name(): string
    {
        return 'gemini';
    }

    public function complete(string $system, string $user, int $maxTokens): string
    {
        if ($this->apiKey === '') {
            throw new AiUnavailable('gemini: sem chave');
        }
        $url = rtrim($this->baseUrl, '/') . '/v1beta/models/' . rawurlencode($this->model) . ':generateContent';
        $res = $this->http->postJson($url, ['x-goog-api-key' => $this->apiKey], [
            'systemInstruction' => ['parts' => [['text' => $system]]],
            'contents' => [['role' => 'user', 'parts' => [['text' => $user]]]],
            'generationConfig' => ['maxOutputTokens' => $maxTokens, 'temperature' => 0.3],
        ], $this->timeout);
        if ($res['status'] !== 200) {
            throw new AiUnavailable("gemini: HTTP {$res['status']}");
        }
        $data = json_decode($res['body'], true);
        $text = '';
        foreach ($data['candidates'][0]['content']['parts'] ?? [] as $part) {
            $text .= is_string($part['text'] ?? null) ? $part['text'] : '';
        }
        // Modelos com "raciocínio" podem gastar o limite de tokens e devolver texto vazio: vira falha (failover).
        if (trim($text) === '') {
            throw new AiUnavailable('gemini: resposta sem texto');
        }
        return trim($text);
    }
}
