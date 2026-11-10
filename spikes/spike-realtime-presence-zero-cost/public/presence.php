<?php
declare(strict_types=1);

// POST {x, z, ry, moving, since} ➔ {status: "success", data: {now, ids, moved, next}}
// A batida do aluno: grava a posição e devolve a sala dele (instituição, cidade e turma da SESSÃO) só com quem andou.
// Erros: 400 INVALID_REQUEST · 401 UNAUTHENTICATED · 405 METHOD_NOT_ALLOWED · 500 SERVER_ERROR

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Presence\DemoSession;
use Spike\Presence\PresenceService;
use Spike\Presence\PresenceStore;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    presence_json(405, ['status' => 'error', 'error' => ['code' => 'METHOD_NOT_ALLOWED']]);
    exit;
}
try {
    presence_session();
    $seat = DemoSession::current();
    // A sessão só é lida: fechá-la já libera a trava do arquivo, e as batidas do mesmo aluno não fazem fila.
    session_write_close();
    $body = presence_body();
    if ($body === null) {
        presence_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
        exit;
    }
    [$status, $out] = (new PresenceService(new PresenceStore(presence_pdo())))->beat($seat, $body);
    presence_json($status, $out);
} catch (Throwable $e) {
    error_log('[spike-presence] ' . get_class($e) . ': ' . $e->getMessage());
    presence_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
