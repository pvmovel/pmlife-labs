<?php
declare(strict_types=1);

// Saúde dos provedores, um por um (não passa pelo failover nem pelo rate limit; gasta 1 pergunta de cada).
//   php scripts/check-providers.php <arquivo-de-env>
// Mostra só o nome, o modelo, o tempo e o motivo da falha: nenhuma chave aparece.
require_once dirname(__DIR__) . '/src/bootstrap.php';

$env = is_file($argv[1] ?? '') ? require $argv[1] : null;
if (!is_array($env)) {
    fwrite(STDERR, "uso: php scripts/check-providers.php <arquivo-de-env>\n");
    exit(1);
}
$failed = false;
echo date('c') . " saúde dos provedores de IA\n";
foreach (check_providers($env, new Spike\Ai\CurlHttpClient()) as $r) {
    $model = $env[strtoupper($r['provider']) . '_MODEL'] ?? 'padrão';
    printf("%s %s (%s): %s em %.1f s\n", $r['ok'] ? 'OK  ' : 'FALHA', $r['provider'], $model, $r['ok'] ? "respondeu \"{$r['detail']}\"" : $r['detail'], $r['seconds']);
    $failed = $failed || !$r['ok'];
}
exit($failed ? 1 : 0);
