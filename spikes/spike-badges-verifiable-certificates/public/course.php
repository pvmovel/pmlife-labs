<?php
declare(strict_types=1);

// GET ➔ o progresso, as medalhas ganhas e o certificado (se já emitido).
// POST {action: "phase", phase} · {action: "points", attribute, points} · {action: "issue"}
// O progresso vem só da sessão; o certificado só sai com todas as fases concluídas (a mesma regra das medalhas).

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Spike\Badges\BadgeRules;
use Spike\Badges\CertificateCode;
use Spike\Badges\CertificateStore;
use Spike\Badges\DemoCourse;
use Spike\Badges\DemoSession;

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $in = $method === 'POST' ? badges_body() : [];
    if ($in === null || !in_array($method, ['GET', 'POST'], true)) {
        badges_json($in === null ? 415 : 405, ['status' => 'error', 'error' => ['code' => $in === null ? 'UNSUPPORTED_MEDIA_TYPE' : 'METHOD_NOT_ALLOWED']]);
        exit;
    }
    badges_session($method === 'POST');
    $who = DemoSession::current();
    if ($who === null) {
        badges_json(401, ['status' => 'error', 'error' => ['code' => 'UNAUTHENTICATED']]);
        exit;
    }
    $store = new CertificateStore(badges_pdo());
    $action = $in['action'] ?? null;
    $ok = match ($action) {
        null => true,
        'phase' => DemoSession::completePhase((string) ($in['phase'] ?? '')),
        'points' => is_int($in['points'] ?? null) && DemoSession::addPoints((string) ($in['attribute'] ?? ''), $in['points']),
        'issue' => true,
        default => false,
    };
    $who = (array) DemoSession::current();
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    if (!$ok) {
        badges_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
        exit;
    }
    $progress = ['phases' => $who['phases'], 'attributes' => $who['attributes']];
    $completed = BadgeRules::courseCompleted(DemoCourse::phaseIds(), $progress);
    if ($action === 'issue') {
        if (!$completed) {
            badges_json(409, ['status' => 'error', 'error' => ['code' => 'COURSE_NOT_COMPLETED']]);
            exit;
        }
        $store->issue($who['tenant'], $who['user'], DemoCourse::ID, ['studentName' => $who['name'], 'courseTitle' => DemoCourse::TITLE, 'institutionName' => DemoCourse::TENANTS[$who['tenant']], 'email' => $who['email']], gmdate('Y-m-d'));
    }
    $cert = $store->ofOwner($who['tenant'], $who['user'], DemoCourse::ID);
    $base = badges_base();
    badges_json($action === 'issue' ? 201 : 200, ['status' => 'success', 'data' => [
        'name' => $who['name'],
        'institution' => DemoCourse::TENANTS[$who['tenant']],
        'phases' => array_map(static fn (string $id, string $title): array => ['id' => $id, 'title' => $title, 'done' => in_array($id, $who['phases'], true)], array_keys(DemoCourse::PHASES), DemoCourse::PHASES),
        'attributes' => $who['attributes'],
        'badges' => array_map(static fn (array $b): array => ['id' => $b['id'], 'title' => $b['title'], 'icon' => $b['icon']], DemoCourse::badges()),
        'earned' => BadgeRules::earned(DemoCourse::badges(), DemoCourse::phaseIds(), $progress),
        'completed' => $completed,
        'certificate' => $cert === null ? null : ['code' => CertificateCode::pretty((string) $cert['code']), 'verify' => "{$base}/verify.php?code={$cert['code']}", 'json' => "{$base}/ob.php?type=assertion&code={$cert['code']}"],
    ]]);
} catch (Throwable $e) {
    error_log('[spike-badges] ' . get_class($e) . ': ' . $e->getMessage());
    badges_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
