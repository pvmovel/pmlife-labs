<?php
declare(strict_types=1);

// Teste de carga curto da presença, contra a demo publicada (decisão do Pablo: o endpoint do labs, de madrugada, com
// o "Uso de recursos" do cPanel aberto). Cada robô entra numa sala, anda e para como um aluno (1 s andando, 5 s
// parado) e, no fim, sai. Um processo só, com curl_multi: não abre 12 terminais.
//   php scripts/load.php <url-da-pasta-public> [robôs=12] [segundos=300] [instituição=aurora] [turma=a]
// Compatível com o PHP 7.4 (o terminal pode não ter o 8.2); nenhuma dependência além do curl.

if ($argc < 2) {
    fwrite(STDERR, "uso: php scripts/load.php <url-da-pasta-public> [robôs=12] [segundos=300] [instituição=aurora] [turma=a]\n");
    exit(1);
}
$base = rtrim($argv[1], '/');
$bots = max(1, (int) ($argv[2] ?? 12));
$seconds = max(10, (int) ($argv[3] ?? 300));
$tenant = $argv[4] ?? 'aurora';
$cohort = $argv[5] ?? 'a';

function request(string $url, array $body, string $jar)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $jar,
        CURLOPT_COOKIEFILE => $jar,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'pmlife-labs-load',
    ]);
    return $ch;
}

function pct(array $v, float $p): float
{
    if ($v === []) {
        return 0.0;
    }
    sort($v);
    return $v[(int) min(count($v) - 1, floor($p * count($v)))];
}

// Entrada: cada robô ganha a própria sessão (o próprio cookie).
$state = [];
for ($i = 0; $i < $bots; $i++) {
    $jar = tempnam(sys_get_temp_dir(), 'load');
    $ch = request("{$base}/session.php", ['action' => 'join', 'tenant' => $tenant, 'cohort' => $cohort], $jar);
    $out = json_decode((string) curl_exec($ch), true);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) {
        fwrite(STDERR, "a entrada do robô {$i} respondeu HTTP {$code}; confira a URL e se a tabela spike_presence existe\n");
        exit(1);
    }
    $state[] = ['jar' => $jar, 'x' => random_int(-1500, 1500), 'z' => random_int(-1500, 1500), 'dx' => 0, 'dz' => 0, 'due' => microtime(true) + $i * 0.08, 'switch' => microtime(true) + random_int(3, 10), 'since' => null, 'busy' => false];
}
printf("%d robôs na sala %s/%s por %d s; Ctrl+C para parar antes\n", $bots, $tenant, $cohort, $seconds);

$multi = curl_multi_init();
$handles = [];
$latencies = [];
$codes = [];
$bytes = 0;
$seen = 0;
$end = microtime(true) + $seconds;
$lastReport = microtime(true);
while (microtime(true) < $end || $handles !== []) {
    $now = microtime(true);
    foreach ($state as $i => &$b) {
        if ($b['busy'] || $now < $b['due'] || $now >= $end) {
            continue;
        }
        // Como um aluno: anda uns segundos (40% das vezes) e para uns segundos.
        if ($now >= $b['switch']) {
            $walk = random_int(1, 100) <= 40;
            $b['dx'] = $walk ? random_int(-1, 1) : 0;
            $b['dz'] = $walk ? random_int(-1, 1) : 0;
            $b['switch'] = $now + random_int(3, 10);
        }
        $moving = $b['dx'] !== 0 || $b['dz'] !== 0;
        $b['x'] = max(-2000, min(2000, $b['x'] + $b['dx'] * 30));
        $b['z'] = max(-2000, min(2000, $b['z'] + $b['dz'] * 30));
        $ch = request("{$base}/presence.php", ['x' => $b['x'], 'z' => $b['z'], 'ry' => 0, 'moving' => $moving, 'since' => $b['since']], $b['jar']);
        curl_multi_add_handle($multi, $ch);
        $handles[(int) $ch] = [$ch, $i, $now];
        $b['busy'] = true;
    }
    unset($b);
    curl_multi_exec($multi, $running);
    while ($done = curl_multi_info_read($multi)) {
        $ch = $done['handle'];
        [, $i, $t0] = $handles[(int) $ch];
        unset($handles[(int) $ch]);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $body = (string) curl_multi_getcontent($ch);
        $latencies[] = (microtime(true) - $t0) * 1000;
        $codes[$code] = ($codes[$code] ?? 0) + 1;
        $bytes += strlen($body);
        $json = json_decode($body, true);
        $next = 5000;
        if ($code === 200 && is_array($json)) {
            $state[$i]['since'] = $json['data']['now'];
            $next = (int) $json['data']['next'];
            $seen = max($seen, count($json['data']['ids']));
        }
        $state[$i]['due'] = microtime(true) + $next / 1000;
        $state[$i]['busy'] = false;
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    if (microtime(true) - $lastReport >= 30) {
        $lastReport = microtime(true);
        printf("  %3d s: %d batidas, mediana %.0f ms, p95 %.0f ms\n", (int) ($seconds - max(0, $end - microtime(true))), count($latencies), pct($latencies, 0.5), pct($latencies, 0.95));
    }
    curl_multi_select($multi, 0.05);
}
curl_multi_close($multi);

// Saída: cada robô sai da sala na hora.
foreach ($state as $b) {
    $ch = request("{$base}/session.php", ['action' => 'leave'], $b['jar']);
    curl_exec($ch);
    curl_close($ch);
    @unlink($b['jar']);
}

$count = count($latencies);
ksort($codes);
echo "\nResultado\n";
printf("  batidas: %d em %d s (%.2f por segundo; %.2f por robô)\n", $count, $seconds, $count / $seconds, $count / $seconds / $bots);
printf("  resposta: mediana %.0f ms, p95 %.0f ms, máxima %.0f ms\n", pct($latencies, 0.5), pct($latencies, 0.95), $latencies === [] ? 0 : max($latencies));
printf("  bytes recebidos: %d (%.0f por batida)\n", $bytes, $count === 0 ? 0 : $bytes / $count);
printf("  colegas vistos ao mesmo tempo: até %d (esperado: %d)\n", $seen, $bots - 1);
echo '  códigos HTTP: ' . implode(', ', array_map(static function ($c, $n) { return "{$c} ×{$n}"; }, array_keys($codes), $codes)) . "\n";
exit(isset($codes[200]) && count($codes) === 1 ? 0 : 1);
