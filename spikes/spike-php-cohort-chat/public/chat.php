<?php
declare(strict_types=1);

// POST {as, action: poll|send|block|report|settings|reports|resolve, ...} (ver src/Chat/ChatService.php)
// O chat da turma. A pessoa, a instituição e a turma vêm só da sessão da demo (session.php): o `as` só escolhe, entre
// as pessoas que entraram por esta sessão, a da aba. Um "from" ou "tenant" no corpo não vale nada.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Chat\ChatService;
use Spike\Chat\ChatStore;
use Spike\Chat\DemoSession;

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        chat_respond(405, ['status' => 'error', 'error' => ['code' => 'METHOD_NOT_ALLOWED']]);
        exit;
    }
    $in = chat_body();
    if ($in === null) {
        chat_respond(415, ['status' => 'error', 'error' => ['code' => 'UNSUPPORTED_MEDIA_TYPE']]);
        exit;
    }
    chat_session();
    $store = new ChatStore(chat_pdo());
    [$status, $body] = (new ChatService($store))->handle(DemoSession::current($store, $in['as'] ?? null), $in);
    chat_respond($status, $body);
} catch (Throwable $e) {
    error_log('[spike-chat] ' . get_class($e) . ': ' . $e->getMessage());
    chat_respond(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
