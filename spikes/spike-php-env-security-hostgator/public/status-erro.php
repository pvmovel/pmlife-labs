<?php
declare(strict_types=1);

// Demo do erro sanitizado: a mesma configuração real, mas apontando para um banco que não existe.
// O cliente recebe só {"status":"error","error":{"code":"DB_UNAVAILABLE"}}; o motivo vai para o log.
// (Banco inexistente, e não senha errada, para a demo pública não gerar tentativas de login falhas.)
require_once dirname(__DIR__) . '/src/db.php';

$config = current_config();
$config['DB_NAME'] = 'banco_que_nao_existe';
connect($config);

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['status' => 'success']);
