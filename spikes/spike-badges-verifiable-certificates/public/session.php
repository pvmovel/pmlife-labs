<?php
declare(strict_types=1);

// POST {action: "join", tenant: 1|2, name} ➔ {tenant, name}
// A entrada da demo, no lugar do login do produto: o servidor guarda a instituição, a pessoa e o progresso na sessão.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Spike\Badges\CertificateStore;
use Spike\Badges\DemoSession;

$body = badges_body();
if ($body === null || ($body['action'] ?? '') !== 'join' || !is_int($body['tenant'] ?? null) || !is_string($body['name'] ?? null)) {
    badges_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
    exit;
}
try {
    (new CertificateStore(badges_pdo()))->purgeDemo();
    badges_session(true);
    $who = DemoSession::join($body['tenant'], $body['name']);
    session_write_close();
    if ($who === null) {
        badges_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
        exit;
    }
    badges_json(200, ['status' => 'success', 'data' => ['tenant' => $who['tenant'], 'name' => $who['name']]]);
} catch (Throwable $e) {
    error_log('[spike-badges] ' . get_class($e) . ': ' . $e->getMessage());
    badges_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
