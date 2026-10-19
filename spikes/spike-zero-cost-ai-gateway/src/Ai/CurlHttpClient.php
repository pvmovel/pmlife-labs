<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Cliente HTTP real (cURL). Timeout sempre abaixo do max_execution_time da hospedagem (~30 s). */
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
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['status' => $response === false ? 0 : $status, 'body' => $response === false ? '' : (string) $response];
    }
}
