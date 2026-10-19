<?php
declare(strict_types=1);

// Cron diário (cPanel): apaga as janelas de rate limit de dias anteriores (o dia de hoje fica).
//   php scripts/purge-rate-limit.php <arquivo-de-env>
require_once dirname(__DIR__) . '/src/bootstrap.php';

$env = require ($argv[1] ?? '');
if (!is_array($env)) {
    fwrite(STDERR, "uso: php scripts/purge-rate-limit.php <arquivo-de-env>\n");
    exit(1);
}
$store = new Spike\Ai\FileRateLimitStore($env['AI_RATE_LIMIT_FILE'] ?? sys_get_temp_dir() . '/spike-ai-rate-limit.json');
// apaga as janelas (por minuto e por dia) anteriores a hoje, em UTC: o limite diário de hoje continua valendo
$removed = $store->purgeBefore((new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d'));
echo date('c') . " purge: {$removed} janelas apagadas\n";
