<?php
declare(strict_types=1);

// Endpoint de exemplo: o webroot só contém controllers finos; a lógica e o env ficam fora dele.
require_once dirname(__DIR__) . '/src/db.php';

$pdo = db();
$pdo->query('SELECT 1');

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['status' => 'success', 'data' => ['db' => 'up']]);
