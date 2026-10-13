<?php
declare(strict_types=1);

// CLI de migrations: php migrate.php <config.php> [status|up]
// O arquivo de configuração retorna o array DB_DRIVER/DB_HOST/... (ver config/env.example.php).

require_once __DIR__ . '/src/ConnectionFactory.php';
require_once __DIR__ . '/src/Migrator.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$configFile = $argv[1] ?? '';
$command = $argv[2] ?? 'status';
if ($configFile === '' || !is_file($configFile)) {
    fwrite(STDERR, "Uso: php migrate.php <config.php> [status|up]\n");
    exit(2);
}

$migrator = new Migrator(ConnectionFactory::create(require $configFile), __DIR__ . '/migrations');

if ($command === 'up') {
    $done = $migrator->migrate();
    echo $done === [] ? "Nada a aplicar.\n" : 'Aplicadas: ' . implode(', ', $done) . "\n";
    exit(0);
}

echo 'Aplicadas: ' . (implode(', ', $migrator->applied()) ?: '(nenhuma)') . "\n";
echo 'Pendentes: ' . (implode(', ', $migrator->pending()) ?: '(nenhuma)') . "\n";
