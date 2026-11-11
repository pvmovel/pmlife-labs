<?php
declare(strict_types=1);

// POST {action: "join", tenant: "aurora"|"boreal", role: "student"|"master"|"author"} ➔ {name, role, tenant}
// A entrada da demo, no lugar do login do produto: o servidor guarda a instituição e o papel na sessão.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Notices\DemoSession;
use Spike\Notices\NoticeStore;

$body = notices_body();
if ($body === null || ($body['action'] ?? '') !== 'join') {
    notices_respond(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
    exit;
}
try {
    notices_session(true);
    $who = DemoSession::join((string) ($body['tenant'] ?? ''), (string) ($body['role'] ?? ''));
    session_write_close();
    if ($who === null) {
        notices_respond(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
        exit;
    }
    (new NoticeStore(notices_pdo()))->purge(86400);
    notices_respond(200, ['status' => 'success', 'data' => ['name' => $who->name, 'role' => $who->role, 'tenant' => (string) $body['tenant']]]);
} catch (Throwable $e) {
    error_log('[spike-notices] ' . get_class($e) . ': ' . $e->getMessage());
    notices_respond(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
