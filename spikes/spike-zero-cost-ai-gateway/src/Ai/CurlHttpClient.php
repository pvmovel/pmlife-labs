<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Cliente HTTP real (cURL). Sem resposta HTTP, devolve status 0 com o motivo (timeout, DNS, conexão). */
final class CurlHttpClient implements HttpClient
{
    public function postJson(string $url, array $headers, array $body, int $timeoutSeconds): array
    {
        $ch = curl_init($url);
        $lines = ['Content-Type: application/json'];
        foreach ($headers as $k => $v) {
            $lines[] = "{$k}: {$v}";
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($ch);
        curl_close($ch);
        if ($response === false) {
            $reason = $errno === CURLE_OPERATION_TIMEDOUT ? "timeout de {$timeoutSeconds} s" : 'sem resposta';
            return ['status' => 0, 'body' => '', 'error' => "{$reason} (curl {$errno})"];
        }
        return ['status' => $status, 'body' => (string) $response];
    }
}
