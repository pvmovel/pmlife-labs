<?php
declare(strict_types=1);

// POST {action: "join", tenant: "aurora"|"boreal", cohort: "a"|"b", staff?: bool} ➔ {id, name, cohort, staff, visible}
// POST {action: "visible", visible: bool} (só a equipe) · POST {action: "leave"}
// A entrada da demo, no lugar do login e da matrícula do produto: o servidor guarda a sala na sessão.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Presence\DemoSession;
use Spike\Presence\PresenceStore;
use Spike\Presence\Seat;

$body = presence_body();
if ($body === null) {
    presence_json(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? 400 : 405, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
    exit;
}
$out = static fn (Seat $s): array => ['status' => 'success', 'data' => ['id' => $s->userId, 'name' => $s->name, 'cohort' => $s->cohort, 'staff' => $s->staff, 'visible' => $s->visible]];
try {
    presence_session();
    $store = new PresenceStore(presence_pdo());
    $action = $body['action'] ?? '';
    if ($action === 'join') {
        $seat = DemoSession::join((string) ($body['tenant'] ?? ''), (string) ($body['cohort'] ?? ''), ($body['staff'] ?? false) === true);
        if ($seat === null) {
            presence_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
            exit;
        }
        $store->purge(3600);
        presence_json(200, $out($seat));
    } elseif ($action === 'visible') {
        $seat = DemoSession::setVisible(($body['visible'] ?? false) === true);
        $seat === null ? presence_json(403, ['status' => 'error', 'error' => ['code' => 'FORBIDDEN']]) : presence_json(200, $out($seat));
    } elseif ($action === 'leave') {
        $seat = DemoSession::current();
        if ($seat !== null) {
            $store->leave($seat);
        }
        presence_json(200, ['status' => 'success', 'data' => ['left' => $seat !== null]]);
    } else {
        presence_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
    }
} catch (Throwable $e) {
    error_log('[spike-presence] ' . get_class($e) . ': ' . $e->getMessage());
    presence_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
