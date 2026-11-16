<?php
declare(strict_types=1);

// A API da demo, no formato do contrato do produto ({status, data} ou {status, error: {code}}):
//   GET                                  ➔ o quiz, a regra (pode abrir? quanto falta?), as tentativas, o XP e o token CSRF
//   POST {action: "start"}               ➔ a tentativa: as questões sorteadas e embaralhadas, SEM o gabarito
//   POST {action: "submit", attemptId, answers: {<id>: resposta}} ➔ a nota, certo/errado e a justificativa de cada uma
// O aluno vem só da sessão; todo POST exige JSON e o X-CSRF-Token.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Poc\Quiz\QuizService;
use Poc\Quiz\QuizStore;

const QUIZ_ID = 'astronomia';

try {
    $store = new QuizStore(quiz_pdo());
    $service = new QuizService($store, static fn (): int => time());
    quiz_session();
    $learner = $_SESSION['quiz']['learner'];
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $store->purgeDemo(time());
        $state = $service->state(QUIZ_ID, $learner);
        session_write_close();
        if ($state === null) {
            quiz_json(404, ['status' => 'error', 'error' => ['code' => 'QUIZ_NOT_FOUND']]);
            exit;
        }
        quiz_json(200, ['status' => 'success', 'data' => $state + ['xp' => $_SESSION['quiz']['xp'], 'csrf' => $_SESSION['quiz']['csrf']]]);
        exit;
    }
    if ($method !== 'POST') {
        session_write_close();
        quiz_json(405, ['status' => 'error', 'error' => ['code' => 'METHOD_NOT_ALLOWED']]);
        exit;
    }
    if (!quiz_csrf_ok()) {
        session_write_close();
        quiz_json(403, ['status' => 'error', 'error' => ['code' => 'CSRF_INVALID']]);
        exit;
    }
    $body = quiz_body();
    $action = $body['action'] ?? null;
    if ($action === 'start') {
        $r = $service->start(QUIZ_ID, $learner);
        session_write_close();
        if (!$r['ok']) {
            $status = $r['code'] === 'QUIZ_COOLDOWN' ? 429 : 409;
            quiz_json($status, ['status' => 'error', 'error' => ['code' => $r['code']] + (isset($r['waitSeconds']) ? ['waitSeconds' => $r['waitSeconds']] : [])]);
            exit;
        }
        quiz_json(200, ['status' => 'success', 'data' => ['attemptId' => $r['attemptId'], 'resumed' => $r['resumed'], 'questions' => $r['questions']]]);
        exit;
    }
    if ($action === 'submit' && is_int($body['attemptId'] ?? null) && is_array($body['answers'] ?? null)) {
        $r = $service->submit(QUIZ_ID, $learner, $body['attemptId'], $body['answers']);
        if (!$r['ok']) {
            session_write_close();
            quiz_json($r['code'] === 'ATTEMPT_NOT_FOUND' ? 404 : 409, ['status' => 'error', 'error' => ['code' => $r['code']]]);
            exit;
        }
        // Na demo, o XP fica na sessão; no produto, a primeira aprovação conclui a missão (o XP e os atributos dela).
        $_SESSION['quiz']['xp'] += $r['xp'];
        $xp = $_SESSION['quiz']['xp'];
        session_write_close();
        unset($r['ok']);
        quiz_json(200, ['status' => 'success', 'data' => $r + ['totalXp' => $xp]]);
        exit;
    }
    session_write_close();
    quiz_json(400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]);
} catch (Throwable $e) {
    error_log('[poc-quiz] ' . get_class($e) . ': ' . $e->getMessage());
    quiz_json(500, ['status' => 'error', 'error' => ['code' => 'SERVER_ERROR']]);
}
