<?php
declare(strict_types=1);

// O script do Cron (e do deploy): aplica as migrations da instituição em cada banco cadastrado e faz a réplica. Só
// pela linha de comando; a API nunca roda DDL. Uma linha por instituição, e código de saída 1 se alguma falhou.
//   APP_ENV=production SPIKE_MYSQL_HOST=… SPIKE_MYSQL_PORT=… SPIKE_MYSQL_USER=… SPIKE_MYSQL_PASS=… \
//   SPIKE_PLATFORM_DB=… php scripts/migrate-tenants.php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/src/factory.php';

use Spike\TenantDb\Db\ConnectionFactory;

$platform = (string) getenv('SPIKE_PLATFORM_DB');
$pdo = ConnectionFactory::create([
    'host' => (string) getenv('SPIKE_MYSQL_HOST'),
    'port' => (int) (getenv('SPIKE_MYSQL_PORT') ?: 3306),
    'db' => $platform,
    'user' => (string) getenv('SPIKE_MYSQL_USER'),
    'pass' => (string) getenv('SPIKE_MYSQL_PASS'),
]);
$parts = spike_tenant_db($pdo, $platform, (string) (getenv('APP_ENV') ?: 'development'));
$start = hrtime(true);
$result = $parts['migrator']->run(gmdate('Y-m-d H:i:s'));
$ms = (hrtime(true) - $start) / 1e6;
if ($result['status'] === 'busy') {
    echo "ocupado: outra execução está rodando; nada feito\n";
    exit(0);
}
$failed = false;
foreach ($result['tenants'] as $t) {
    $failed = $failed || $t['error'] !== null;
    printf("%s  %-8s aplicadas: %s  pessoas: %s%s\n", $t['db'], $t['state'], $t['applied'] === [] ? '—' : implode(',', $t['applied']), $t['people'] ?? '—', $t['error'] ? "  erro: {$t['error']}" : '');
}
printf("%d instituição(ões) em %.1f ms\n", count($result['tenants']), $ms);
exit($failed ? 1 : 0);
