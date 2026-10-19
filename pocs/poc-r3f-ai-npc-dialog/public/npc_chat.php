<?php
declare(strict_types=1);

// Controller fino do mock de diálogo com NPC. A lógica e as personas ficam fora do webroot (api/ responde 403).
require_once dirname(__DIR__) . '/api/npc_mock.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    [$status, $body] = npc_mock_handle($_SERVER['REQUEST_METHOD'] ?? 'GET', (string) file_get_contents('php://input'), require dirname(__DIR__) . '/api/personas.php');
} catch (Throwable $e) {
    error_log('[npc_chat] ' . get_class($e) . ': ' . $e->getMessage());
    [$status, $body] = [500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]];
}

http_response_code($status);
echo json_encode($body, JSON_UNESCAPED_UNICODE);
