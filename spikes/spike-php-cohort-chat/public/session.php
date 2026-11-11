<?php
declare(strict_types=1);

// POST {action: "join", tenant: "aurora"|"boreal", cohort: "a"|"b", role: "student"|"master"} ➔ {id, name, role, cohort}
// A entrada da demo, no lugar do login do produto: o servidor cria a pessoa fictícia e guarda só o id dela na sessão.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Chat\ChatStore;
use Spike\Chat\DemoSession;

$body = chat_body();
if ($body === null || ($body['action'] ?? '') !== 'join') {
    chat_respond(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
    exit;
}
try {
    $store = new ChatStore(chat_pdo());
    $store->purgeDemo();
    chat_session(true);
    $who = DemoSession::join($store, (string) ($body['tenant'] ?? ''), (string) ($body['cohort'] ?? ''), (string) ($body['role'] ?? ''));
    session_write_close();
    if ($who === null) {
        chat_respond(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
        exit;
    }
    chat_respond(200, ['status' => 'success', 'data' => ['id' => $who->id, 'name' => $who->name, 'role' => $who->role, 'cohort' => $who->cohort, 'tenant' => (string) $body['tenant']]]);
} catch (Throwable $e) {
    error_log('[spike-chat] ' . get_class($e) . ': ' . $e->getMessage());
    chat_respond(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
