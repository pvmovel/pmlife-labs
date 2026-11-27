<?php
declare(strict_types=1);

// Demo do labs (só leitura, sem banco e sem upload): o PHP entrega, com Range, uma amostra fictícia guardada em
// samples/, uma pasta que o navegador não acessa (403). No produto, o arquivo vem da pasta da instituição, fora do
// webroot, depois da sessão e da matrícula (FilesApi ➔ FileService ➔ FileSender).
require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Files\Http\FileSender;
use Spike\Files\Storage\StoredFile;

$samples = [
    'pdf' => ['exemplo.pdf', 'application/pdf', 'Material de exemplo.pdf'],
    'png' => ['exemplo.png', 'image/png', 'Imagem de exemplo.png'],
];
$pick = $samples[(string) ($_GET['f'] ?? '')] ?? null; // lista fechada: o pedido nunca vira caminho
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($pick === null || !in_array($method, ['GET', 'HEAD'], true)) {
    http_response_code($pick === null ? 404 : 405);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['status' => 'error', 'error' => ['code' => $pick === null ? 'NOT_FOUND' : 'METHOD_NOT_ALLOWED']]);
    return;
}
$path = dirname(__DIR__) . '/samples/' . $pick[0];
$file = new StoredFile(str_repeat('0', 32), 1, 1, str_repeat('0', 32), $pick[1], (int) filesize($path),
    (string) hash_file('sha256', $path), $pick[2], 1, '2026-11-27 00:00:00');
FileSender::send($file, fopen($path, 'rb'), $_SERVER['HTTP_RANGE'] ?? null, $method === 'HEAD');
