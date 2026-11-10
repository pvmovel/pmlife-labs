<?php
declare(strict_types=1);

// Prova o spike da US41: a presença por polling curto no PHP com MySQL, sem serviço externo de tempo real.
// Sem banco: a validação da batida e o ritmo adaptativo. Com um MySQL (SPIKE_MYSQL_*), as regras da sala (a turma, a
// instituição, o que mudou, quem saiu, o master invisível), os endpoints de verdade pelo servidor embutido do PHP (a
// sessão e o isolamento) e as medições: o custo de cada batida, o tamanho da resposta e quantos alunos cabem.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS (o mesmo do CI do labs)
// ATENÇÃO: o script apaga e recria a tabela spike_presence do banco informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Presence\PresenceService;
use Spike\Presence\PresenceStore;
use Spike\Presence\Seat;

$root = dirname(__DIR__);
$failed = false;
$total = 0;

function check(bool $ok, string $label): void
{
    global $failed, $total;
    $total++;
    echo ($ok ? '✅ ' : '❌ ') . $label . "\n";
    if (!$ok) {
        $failed = true;
    }
}

/** @param list<float> $values */
function percentile(array $values, float $p): float
{
    sort($values);
    return $values === [] ? 0.0 : $values[(int) min(count($values) - 1, floor($p * count($values)))];
}

echo "== A batida, sem banco ==\n";
// A validação vem antes de qualquer SQL: um store sem conexão basta.
$offline = (new ReflectionClass(PresenceStore::class))->newInstanceWithoutConstructor();
$service = new PresenceService($offline);
$seat = new Seat(1, 10, 'Ana', 'cidade-do-curso', 'a');
check($service->beat(null, ['x' => 0, 'z' => 0, 'ry' => 0])[0] === 401, 'sem sessão, 401 UNAUTHENTICATED (a sala nunca vem do pedido)');
$bad = [['x' => 0.5, 'z' => 0, 'ry' => 0], ['x' => 0, 'z' => 99999, 'ry' => 0], ['x' => 0, 'z' => 0, 'ry' => 3600], ['x' => 0, 'z' => 0, 'ry' => 0, 'since' => "1' OR 1=1"], ['z' => 0, 'ry' => 0]];
check(array_unique(array_map(static fn (array $b): int => $service->beat($seat, $b)[0], $bad)) === [400], 'posição fora da cidade, rotação inválida, cursor fora do formato ou campo faltando: 400, antes de tocar no banco');

$host = getenv('SPIKE_MYSQL_HOST');
if (!$host) {
    echo "\n⚠️  Sem SPIKE_MYSQL_*: só a validação foi testada.\n";
    echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
    exit($failed ? 1 : 0);
}

$pdo = presence_pdo();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "\n== A sala, no MySQL {$version} ==\n";
$pdo->exec('DROP TABLE IF EXISTS spike_presence');
$pdo->exec((string) file_get_contents("{$root}/migrations/mysql/001_create_spike_presence.sql"));
$store = new PresenceStore($pdo);
$service = new PresenceService($store);
$sit = static fn (int $tenant, int $id, string $cohort, bool $staff = false, bool $visible = true): Seat => new Seat($tenant, $id, "P{$id}", 'cidade-do-curso', $cohort, $staff, $visible);
$ana = $sit(1, 1, 'a');
$bia = $sit(1, 2, 'a');
$caio = $sit(1, 3, 'a');
$davi = $sit(1, 4, 'b');
$eva = $sit(2, 5, 'a');
$mestre = $sit(1, 6, 'a', true, false);
foreach ([$ana, $bia, $caio, $davi, $eva, $mestre] as $s) {
    $service->beat($s, ['x' => $s->userId * 10, 'z' => 0, 'ry' => 0]);
}
$room = static fn (Seat $s, array $extra = []): array => $service->beat($s, ['x' => $s->userId * 10, 'z' => 0, 'ry' => 0] + $extra)[1]['data'];
$r = $room($ana);
sort($r['ids']);
check($r['ids'] === [2, 3], 'Gherkin: a Ana vê a Bia e o Caio, da mesma instituição e da mesma turma, e não vê o Davi (outra turma) nem a Eva (outra instituição)');
check($room($eva)['ids'] === [] && $room($davi)['ids'] === [], 'isolamento: a Eva (Boreal) e o Davi (turma B) estão sozinhos nas salas deles');
$forged = $service->beat($eva, ['x' => 50, 'z' => 0, 'ry' => 0, 'tenant' => 1, 'cohort' => 'a', 'city' => 'cidade-do-curso'])[1]['data'];
check($forged['ids'] === [], 'Gherkin: a aluna de outra instituição que manda a sala da Aurora no pedido continua na dela (o servidor só usa a sessão)');
check(!in_array(6, $r['ids'], true) && in_array(1, $room($mestre)['ids'], true), 'o master entra invisível: vê a turma, e a turma não o vê');
$visible = $sit(1, 6, 'a', true, true);
$service->beat($visible, ['x' => 60, 'z' => 0, 'ry' => 0]);
$withStaff = array_column($room($ana)['moved'], 's', 'id');
check(($withStaff[6] ?? null) === 1, 'com "Aparecer", o master surge para a turma com o selo de equipe (s = 1)');

echo "\n== Só o que mudou ==\n";
$first = $room($ana);
usleep(5000);
$idle = $room($ana, ['since' => $first['now']]);
check(count($first['moved']) === 3 && $idle['moved'] === [] && count($idle['ids']) === 3, 'com o cursor, a batida de quem está parado traz só os ids da sala, sem posições');
$service->beat($bia, ['x' => 999, 'z' => 5, 'ry' => 900]);
$after = $room($ana, ['since' => $idle['now']]);
check(array_column($after['moved'], 'id') === [2] && $after['moved'][0]['x'] === 999 && $after['moved'][0]['r'] === 900, 'a Bia andou: a resposta da Ana traz só a Bia, com a posição nova');
$service->beat($bia, ['x' => 999, 'z' => 5, 'ry' => 900]);
check($room($ana, ['since' => $after['now']])['moved'] === [], 'a batida parada da Bia (mesma posição) só renova a presença e não volta como mudança');
$pdo->exec("UPDATE spike_presence SET seen_at = NOW(3) - INTERVAL 20 SECOND WHERE user_id = 3");
check(!in_array(3, $room($ana)['ids'], true), 'o Caio parou de bater por mais de 15 s (aba fechada, rede caiu): saiu da sala');
$store->leave($bia);
check(!in_array(2, $room($ana)['ids'], true), 'a Bia saiu da cidade (o sendBeacon do fechamento da aba): sai da sala na hora');
check($service->beat($ana, ['x' => 1, 'z' => 1, 'ry' => 0, 'moving' => true])[1]['data']['next'] === 1000 && $service->beat($ana, ['x' => 1, 'z' => 1, 'ry' => 0])[1]['data']['next'] === 5000, 'o ritmo: 1 s andando, 5 s parado (decisão do Pablo)');

echo "\n== Os endpoints de verdade (servidor embutido do PHP) ==\n";
$port = 18000 + random_int(0, 999);
$cmd = sprintf('exec %s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg("{$root}/public"));
$server = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, null, getenv());
$pid = (int) proc_get_status($server)['pid'];
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100000);
}
/** @return array{0: int, 1: array<string, mixed>|null, 2: int, 3: float} */
$http = static function (string $path, array $body, string $jar) use ($port): array {
    $ch = curl_init("http://127.0.0.1:{$port}/{$path}");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body), CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
    $t0 = hrtime(true);
    $out = (string) curl_exec($ch);
    $ms = (hrtime(true) - $t0) / 1e6;
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode($out, true), strlen($out), $ms];
};
$jarA = tempnam(sys_get_temp_dir(), 'jar');
$jarB = tempnam(sys_get_temp_dir(), 'jar');
$jarC = tempnam(sys_get_temp_dir(), 'jar');
$pdo->exec('TRUNCATE spike_presence');
check($http('presence.php', ['x' => 0, 'z' => 0, 'ry' => 0], tempnam(sys_get_temp_dir(), 'jar'))[0] === 401, 'sem a sessão da entrada, a batida é recusada (401)');
$http('session.php', ['action' => 'join', 'tenant' => 'aurora', 'cohort' => 'a'], $jarA);
$http('session.php', ['action' => 'join', 'tenant' => 'aurora', 'cohort' => 'a'], $jarB);
$http('session.php', ['action' => 'join', 'tenant' => 'boreal', 'cohort' => 'a'], $jarC);
$http('presence.php', ['x' => 100, 'z' => 0, 'ry' => 0, 'moving' => true], $jarA);
$http('presence.php', ['x' => 0, 'z' => 0, 'ry' => 0], $jarC);
$b = $http('presence.php', ['x' => 0, 'z' => 0, 'ry' => 0], $jarB);
$c = $http('presence.php', ['x' => 0, 'z' => 0, 'ry' => 0, 'tenant' => 'aurora'], $jarC);
check($b[0] === 200 && count($b[1]['data']['ids']) === 1 && ($b[1]['data']['moved'][0]['x'] ?? null) === 100, 'duas abas da Aurora, turma A: a segunda vê a primeira, na posição que ela mandou');
check($c[0] === 200 && $c[1]['data']['ids'] === [], 'Gherkin: a aba da Boreal não entra na sala da Aurora, nem pedindo');
check($http('session.php', ['action' => 'visible', 'visible' => true], $jarA)[0] === 403, 'só a equipe pode aparecer ou sumir (o aluno recebe 403)');

echo "\n== Medições ==\n";
// 1) A consulta, dentro do PHP: uma batida (upsert + leitura da sala) com salas de 12, 24 e 48 e 20 salas no banco.
$pdo->exec('TRUNCATE spike_presence');
$costs = [];
foreach ([12, 24, 48] as $size) {
    $pdo->exec('TRUNCATE spike_presence');
    $seats = [];
    for ($room = 0; $room < 20; $room++) {
        for ($i = 0; $i < $size; $i++) {
            $s = new Seat(1 + intdiv($room, 10), $room * 1000 + $i + 1, "A{$i}", 'cidade-do-curso', 'c' . ($room % 10));
            $store->beat($s, random_int(-2000, 2000), random_int(-2000, 2000), 0);
            $seats[] = $s;
        }
    }
    $samples = [];
    $since = null;
    for ($n = 0; $n < 600; $n++) {
        $s = $seats[array_rand($seats)];
        $t0 = hrtime(true);
        $res = $service->beat($s, ['x' => random_int(-2000, 2000), 'z' => random_int(-2000, 2000), 'ry' => 0, 'moving' => true, 'since' => $since]);
        $samples[] = (hrtime(true) - $t0) / 1e6;
        $since = $res[1]['data']['now'];
    }
    $costs[$size] = percentile($samples, 0.5);
    printf("   sala de %2d (20 salas, %4d linhas): batida mediana %.2f ms, p95 %.2f ms\n", $size, $size * 20, $costs[$size], percentile($samples, 0.95));
}
// O tempo de parede depende do disco do MySQL (a gravação de cada batida); o que importa aqui é ele não crescer com a sala.
check($costs[48] < $costs[12] * 3 + 2, 'a batida (upsert + leitura da sala) não fica mais cara com a sala: o índice (instituição, cidade, turma, visto em) lê só a sala');

// 2) O tamanho da resposta numa sala de 12: todos andando (a primeira batida) e todos parados (com o cursor).
$pdo->exec('TRUNCATE spike_presence');
$twelve = [];
for ($i = 1; $i <= 12; $i++) {
    $twelve[] = $s = new Seat(1, $i, 'Aluno ' . str_pad((string) $i, 4, '0', STR_PAD_LEFT), 'cidade-do-curso', 'a');
    $store->beat($s, $i * 100, -$i * 100, 900);
}
$all = json_encode($service->beat($twelve[0], ['x' => 100, 'z' => -100, 'ry' => 900])[1]);
$quiet = json_encode($service->beat($twelve[0], ['x' => 100, 'z' => -100, 'ry' => 900, 'since' => json_decode((string) $all, true)['data']['now']])[1]);
printf("   resposta numa sala de 12: %d bytes com os 11 colegas andando, %d bytes com todos parados\n", strlen((string) $all), strlen((string) $quiet));
check(strlen((string) $quiet) < strlen((string) $all) / 2, 'parados, a resposta tem menos da metade do tamanho (só os ids)');

// 3) O pedido inteiro pelo HTTP (o PHP compila e roda o script, abre a sessão e a conexão), sem opcache: o CPU do
//    processo do servidor embutido, lido do /proc, dividido pelos pedidos. É o número que pesa nos 25% da conta.
$cpu = static function (int $pid): float {
    $stat = explode(' ', (string) @file_get_contents("/proc/{$pid}/stat"));
    return isset($stat[14]) ? ((int) $stat[13] + (int) $stat[14]) / 100 : -1.0;
};
$jar = tempnam(sys_get_temp_dir(), 'jar');
$http('session.php', ['action' => 'join', 'tenant' => 'aurora', 'cohort' => 'a'], $jar);
$walls = [];
$before = $cpu($pid);
$requests = 400;
for ($n = 0; $n < $requests; $n++) {
    $walls[] = $http('presence.php', ['x' => $n % 2000, 'z' => 0, 'ry' => 0, 'moving' => true], $jar)[3];
}
$cpuMs = $before < 0 ? -1.0 : ($cpu($pid) - $before) * 1000 / $requests;
proc_terminate($server);
proc_close($server);
$wall = percentile($walls, 0.5);
printf("   pedido inteiro pelo HTTP: %.2f ms de CPU do PHP por pedido, %.2f ms de resposta (mediana, local)\n", $cpuMs, $wall);
check($cpuMs > 0 && $cpuMs < 20, 'o CPU do PHP por batida, com a compilação do script, a sessão e a conexão, cabe no orçamento');

// 4) Quantos alunos cabem: a conta tem 25% de um núcleo (250 ms de CPU por segundo) para produção, homolog e labs.
//    Reservando METADE para o resto do site, a presença tem 125 ms de CPU por segundo. Um aluno andando bate 1 vez
//    por segundo; parado, 1 a cada 5 s. A capacidade é medida de novo na HostGator (scripts/load.php).
echo "\n   Capacidade estimada (125 ms de CPU por segundo para a presença, CPU medido acima, sem opcache):\n";
foreach ([0.3, 0.5, 1.0] as $moving) {
    $rate = $moving * 1.0 + (1 - $moving) * 0.2;
    printf("   %3d%% do tempo andando: %.2f batidas/s por aluno ➔ ~%d alunos online; ~%.1f processos PHP ocupados em média\n", (int) ($moving * 100), $rate, (int) floor(125 / ($cpuMs * $rate)), floor(125 / ($cpuMs * $rate)) * $rate * $wall / 1000);
}
check(floor(125 / ($cpuMs * 0.44)) >= 24, 'com 30% do tempo andando, cabem pelo menos duas turmas de 12 online ao mesmo tempo');

$pdo->exec('DROP TABLE IF EXISTS spike_presence');
echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
exit($failed ? 1 : 0);
