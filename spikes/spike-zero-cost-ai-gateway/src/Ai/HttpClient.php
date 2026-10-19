<?php
declare(strict_types=1);

namespace Spike\Ai;

/** POST JSON com timeout. Interface para os testes trocarem a rede por um fake. */
interface HttpClient
{
    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>  $body
     * @return array{status: int, body: string}
     */
    public function postJson(string $url, array $headers, array $body, int $timeoutSeconds): array;
}
