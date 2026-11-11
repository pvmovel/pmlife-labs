<?php
declare(strict_types=1);

// GET ?place=hq&lang=pt-BR (If-None-Match ➔ 304) · POST {action: create|update|delete, id?, place, title, body, pinned?}
// O mural de um lugar. A instituição vem só da sessão da demo (session.php).

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Notices\DemoSession;
use Spike\Notices\NoticeService;
use Spike\Notices\NoticeStore;

try {
    notices_session();
    $who = DemoSession::current();
    $service = new NoticeService(new NoticeStore(notices_pdo()));
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        [$status, $body, $headers] = $service->read($who, $_GET['place'] ?? null, $_GET['lang'] ?? null, $_SERVER['HTTP_IF_NONE_MATCH'] ?? null);
    } elseif ($method === 'POST') {
        $in = notices_body();
        [$status, $body, $headers] = $in === null ? [415, ['status' => 'error', 'error' => ['code' => 'UNSUPPORTED_MEDIA_TYPE']], []] : $service->write($who, $in);
    } else {
        [$status, $body, $headers] = [405, ['status' => 'error', 'error' => ['code' => 'METHOD_NOT_ALLOWED']], []];
    }
    notices_respond($status, $body, $headers);
} catch (Throwable $e) {
    error_log('[spike-notices] ' . get_class($e) . ': ' . $e->getMessage());
    notices_respond(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
