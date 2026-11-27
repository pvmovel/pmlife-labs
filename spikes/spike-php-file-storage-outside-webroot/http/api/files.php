<?php
declare(strict_types=1);

// Controller fino do spike (no labs responde 403: a pasta http/ não é webroot, e o labs não aceita upload público).
// Na Etapa 2 vira public/api/files.php, com o env, a sessão (Viewer) e o CSRF da US30.
//   GET  ?route=list&courseId=7          GET ?route=show&id=<32 hex>
//   POST ?route=upload (multipart: courseId, file)   POST ?route=delete (JSON: id)
require_once dirname(__DIR__, 2) . '/src/factory.php';

use Spike\Files\Http\FileSender;
use Spike\Files\Storage\Viewer;

session_start();
$viewer = isset($_SESSION['tenant_id'], $_SESSION['user_id'])
    ? new Viewer((int) $_SESSION['tenant_id'], (int) $_SESSION['user_id'], (bool) ($_SESSION['can_manage'] ?? false),
        array_map('intval', (array) ($_SESSION['courses'] ?? [])))
    : null;
$csrfSession = (string) ($_SESSION['csrf'] ?? '');
session_write_close(); // o áudio pede vários trechos ao mesmo tempo: a sessão não pode travar os outros pedidos

$route = (string) ($_GET['route'] ?? '');
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
$json = json_decode((string) file_get_contents('php://input'), true);
$input = $_GET + $_POST + (is_array($json) ? $json : []);
$result = spike_files_api(spike_files_config_from_env())->handle(
    $route, $method === 'HEAD' ? 'GET' : $method, $viewer, $input, $_FILES['file'] ?? null,
    (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''), $csrfSession,
);

if (isset($result['file'])) {
    FileSender::send($result['file']['file'], $result['file']['stream'], $_SERVER['HTTP_RANGE'] ?? null, $method === 'HEAD');
    return;
}
http_response_code($result['status']);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode($result['body'], JSON_UNESCAPED_UNICODE);
