<?php
declare(strict_types=1);

// POST { persona, message, context[] } ➔ { status: "success", data: { answer, provider } }
// Erros: 400 INVALID_REQUEST · 405 METHOD_NOT_ALLOWED · 429 RATE_LIMITED · 503 AI_UNAVAILABLE · 500 SERVER_ERROR
// Controller fino: env e lógica ficam fora do webroot (src/ responde 403 no servidor).

require_once dirname(__DIR__) . '/src/env-loader.php';
require_once dirname(__DIR__) . '/src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $gateway = build_gateway(load_env(detect_env($_SERVER['HTTP_HOST'] ?? '')));
    [$status, $body] = $gateway->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', (string) file_get_contents('php://input'), client_ip($_SERVER), new DateTimeImmutable());
} catch (Throwable $e) {
    error_log('[ai_chat] ' . get_class($e) . ': ' . $e->getMessage());
    [$status, $body] = [500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]];
}

http_response_code($status);
echo json_encode($body, JSON_UNESCAPED_UNICODE);
