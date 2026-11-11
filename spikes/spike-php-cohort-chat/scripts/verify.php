<?php
declare(strict_types=1);

// Prova o spike da US42: o chat por turma (turma, perto e privado) com moderação, por polling curto no PHP e no MySQL.
// Sem banco: as regras (o texto, o filtro de palavras, a distância).
// Com um MySQL (SPIKE_MYSQL_*): os três cenários do Gherkin, o isolamento por turma e por instituição, o privado
// desligado até o master ligar, o limite por minuto, o filtro, a denúncia, a guarda de 90 dias, a entrega com 250 ms e
// os endpoints pelo servidor embutido do PHP (a sessão e o remetente que vem só dela).
// ATENÇÃO: o script apaga e recria as tabelas spike_chat_* do banco informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Chat\ChatRules;
use Spike\Chat\ChatService;
use Spike\Chat\ChatStore;

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

echo "== As regras, sem banco ==\n";
check(ChatRules::body('  oi, turma!  ') === 'oi, turma!' && ChatRules::body('') === null && ChatRules::body(str_repeat('a', 501)) === null && ChatRules::body("a\x07b") === null && ChatRules::body("linha 1\nlinha 2") !== null, 'o texto: de 1 a 500 caracteres, sem caractere de controle (a quebra de linha fica)');
$words = ChatRules::words("Bobo, idiota\n<script>\n  ");
check($words === ['bobo', 'idiota'], 'a lista de palavras: sem maiúsculas, sem acentos e só letras e números');
check(ChatRules::blockedWord('Você é um BÓBO!', $words) === 'bobo' && ChatRules::blockedWord('o bobolho da aula', $words) === null && ChatRules::blockedWord('tudo certo', $words) === null, 'o filtro pega a palavra inteira, sem diferença de maiúsculas e acentos, e não pega pedaço de outra palavra');
check(ChatRules::near(0, 0, 30, 0) && ChatRules::near(0, 0, 30, 40) && !ChatRules::near(0, 0, 200, 0) && !ChatRules::near(0, 0, 36, 36), 'o "perto": até 5 m (em decímetros, como a presença); 3 m sim, 20 m não');

$host = getenv('SPIKE_MYSQL_HOST');
if (!$host) {
    echo "\n⚠️  Sem SPIKE_MYSQL_*: só as regras foram testadas.\n";
    echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
    exit($failed ? 1 : 0);
}

$pdo = chat_pdo();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "\n== O chat, no MySQL {$version} ==\n";
foreach (['spike_chat_deliveries', 'spike_chat_blocks', 'spike_chat_reports', 'spike_chat_settings', 'spike_chat_messages', 'spike_chat_people'] as $t) {
    $pdo->exec("DROP TABLE IF EXISTS {$t}");
}
foreach (array_filter(array_map('trim', explode(';', (string) preg_replace('/^--.*$/m', '', (string) file_get_contents("{$root}/migrations/mysql/001_create_spike_chat.sql"))))) as $sql) {
    $pdo->exec($sql);
}
$store = new ChatStore($pdo);
$chat = new ChatService($store);
$person = static fn (int $tenant, string $cohort, string $name, string $role = 'student') => $store->person($store->addPerson($tenant, $cohort, $name, $role));
$ana = $person(1, 'a', 'Ana');
$bia = $person(1, 'a', 'Bia');
$caio = $person(1, 'a', 'Caio');
$davi = $person(1, 'b', 'Davi');
$eva = $person(2, 'a', 'Eva');
$mara = $person(1, 'a', 'Mara', 'master');
$bruno = $person(2, 'a', 'Bruno', 'master');
$poll = static function ($who, int $since = 0, string $place = 'cidade', int $x = 0, int $z = 0) use ($chat): array {
    return $chat->handle($who, ['action' => 'poll', 'since' => $since, 'place' => $place, 'x' => $x, 'z' => $z])[1]['data'] ?? [];
};
$send = static fn ($who, string $channel, string $body, array $extra = []): array => $chat->handle($who, ['action' => 'send', 'channel' => $channel, 'body' => $body] + $extra);
$bodies = static fn (array $data): array => array_column($data['messages'] ?? [], 'body');
$settle = static fn () => usleep(300000);

// Ana em (0, 0), Bia a 3 m e Caio a 20 m, na mesma cidade; Davi (outra turma) ao lado de Ana.
$poll($ana, 0, 'cidade', 0, 0);
$poll($bia, 0, 'cidade', 30, 0);
$poll($caio, 0, 'cidade', 200, 0);
$poll($davi, 0, 'cidade', 10, 0);
[$s, $b] = $send($ana, 'near', 'Alguém entendeu a missão 2?');
check($s === 201 && ($b['data']['delivered'] ?? -1) === 1, 'o "perto" é decidido no envio, pela posição: só 1 pessoa a até 5 m (Davi, ao lado, é de outra turma)');
$settle();
check($bodies($poll($bia, 0, 'cidade', 30, 0)) === ['Alguém entendeu a missão 2?'] && $bodies($poll($caio, 0, 'cidade', 200, 0)) === [] && $bodies($poll($davi, 0, 'cidade', 10, 0)) === [], 'Gherkin "Conversa por proximidade": Bia (3 m) recebe; Caio (20 m) e Davi (outra turma) não recebem');

[$s] = $send($ana, 'cohort', 'Bom dia, turma A!');
$settle();
check($s === 201 && in_array('Bom dia, turma A!', $bodies($poll($caio, 0, 'fase-1')), true) && $bodies($poll($davi)) === [] && $bodies($poll($eva)) === [], 'a turma: chega a toda a turma A, em qualquer lugar do curso; nem a turma B nem outra instituição recebem');

check($send($ana, 'private', 'Oi, Bia', ['to' => $bia->id])[1]['error']['code'] === 'PRIVATE_OFF', 'o privado começa desligado em cada curso (403 PRIVATE_OFF)');
check($chat->handle($ana, ['action' => 'settings', 'chatOn' => true, 'privateOn' => true, 'words' => ''])[0] === 403, 'só o master muda o chat do curso (403 para o aluno)');
[$s, $b] = $chat->handle($mara, ['action' => 'settings', 'chatOn' => true, 'privateOn' => true, 'words' => 'bobo, idiota']);
check($s === 200 && $b['data']['words'] === ['bobo', 'idiota'], 'o master liga o privado e põe as palavras recusadas');
[$s] = $send($ana, 'private', 'Oi, Bia, só para você', ['to' => $bia->id]);
$settle();
$caioSees = $bodies($poll($caio));
check($s === 201 && in_array('Oi, Bia, só para você', $bodies($poll($bia)), true) && !in_array('Oi, Bia, só para você', $caioSees, true) && !in_array('Oi, Bia, só para você', $bodies($poll($mara)), true), 'Gherkin "Privado é privado": Bia recebe; Caio, na mesma cidade, não recebe nada (o servidor não manda a ele); o master também não');
check($send($ana, 'private', 'Oi, Davi', ['to' => $davi->id])[1]['error']['code'] === 'RECIPIENT_NOT_FOUND' && $send($ana, 'private', 'Oi, Eva', ['to' => $eva->id])[1]['error']['code'] === 'RECIPIENT_NOT_FOUND', 'o privado só vai para alguém da mesma turma (outra turma ou instituição: 404)');
check($bruno !== null && $chat->handle($bruno, ['action' => 'settings', 'chatOn' => true, 'privateOn' => true, 'words' => ''])[0] === 200 && $send($eva, 'private', 'x', ['to' => $ana->id])[1]['error']['code'] === 'RECIPIENT_NOT_FOUND', 'o chat de cada instituição é dela: a Boreal liga o dela, e ainda assim não fala com a Aurora');

$forged = $chat->handle($ana, ['action' => 'send', 'channel' => 'cohort', 'body' => 'Sou a Bia', 'from' => $bia->id, 'sender' => 'Bia', 'tenant' => 2, 'cohort' => 'b']);
$settle();
$last = array_values(array_filter($poll($caio)['messages'], static fn ($m) => $m['body'] === 'Sou a Bia'))[0] ?? [];
check($forged[0] === 201 && ($last['from']['id'] ?? 0) === $ana->id && ($last['from']['name'] ?? '') === 'Ana', 'o remetente vem só da sessão: "from", "tenant" e "cohort" no pedido não valem nada');

check($chat->handle($bia, ['action' => 'block', 'id' => $ana->id, 'on' => true])[1]['data']['blocked'] === [$ana->id], 'Bia bloqueia Ana');
$cursorBia = $poll($bia)['cursor'];
$cursorCaio = $poll($caio)['cursor'];
$send($ana, 'cohort', 'Mensagem depois do bloqueio');
$send($ana, 'private', 'Privado depois do bloqueio', ['to' => $bia->id]);
$settle();
check($bodies($poll($bia, $cursorBia)) === [] && $bodies($poll($caio, $cursorCaio)) === ['Mensagem depois do bloqueio'], 'Gherkin "Bloquear": Bia não vê mais nada de Ana (turma e privado); Caio continua vendo');
check(!in_array('Bom dia, turma A!', $bodies($poll($bia)), true), 'e as mensagens antigas de Ana também somem para Bia');
$chat->handle($bia, ['action' => 'block', 'id' => $ana->id, 'on' => false]);
check(in_array('Bom dia, turma A!', $bodies($poll($bia)), true), 'ao desbloquear, as mensagens voltam');

$pdo->exec('DELETE FROM spike_chat_messages WHERE sender_id = ' . $caio->id);
$codes = [];
for ($i = 1; $i <= ChatRules::RATE_PER_MINUTE + 1; $i++) {
    $codes[] = $send($caio, 'cohort', "mensagem {$i}")[0];
}
check(array_count_values($codes) === [201 => ChatRules::RATE_PER_MINUTE, 429 => 1], 'o limite: 10 mensagens por minuto; a 11ª é recusada (429 RATE_LIMITED)');
check($send($bia, 'cohort', 'Você é um BÓBO')[1]['error']['code'] === 'BLOCKED_WORD' && $send($bia, 'cohort', 'Que bobolho legal')[0] === 201, 'o filtro de palavras: "BÓBO" é recusado (422); "bobolho" passa');

$target = $send($ana, 'cohort', 'Mensagem ofensiva de exemplo')[1]['data']['id'];
$settle();
check($chat->handle($caio, ['action' => 'report', 'messageId' => $target])[0] === 201, 'Caio denuncia a mensagem que chegou a ele');
$privateOfOthers = (int) $pdo->query("SELECT id FROM spike_chat_messages WHERE channel = 'private' AND recipient_id = {$bia->id} ORDER BY id LIMIT 1")->fetchColumn();
check($chat->handle($caio, ['action' => 'report', 'messageId' => $privateOfOthers])[0] === 404 && $chat->handle($davi, ['action' => 'report', 'messageId' => $target])[0] === 404, 'ninguém denuncia o que não chegou a ele (o privado de outros, a mensagem de outra turma): 404');
$reports = $chat->handle($mara, ['action' => 'reports'])[1]['data']['reports'] ?? [];
check(count($reports) === 1 && $reports[0]['body'] === 'Mensagem ofensiva de exemplo' && $reports[0]['sender'] === 'Ana' && $reports[0]['reporter'] === 'Caio', 'o master vê a denúncia, com a mensagem e quem mandou');
check(($chat->handle($bruno, ['action' => 'reports'])[1]['data']['reports'] ?? null) === [] && $chat->handle($caio, ['action' => 'reports'])[0] === 403, 'o master da Boreal não vê a denúncia da Aurora; o aluno não vê a fila (403)');

$chat->handle($mara, ['action' => 'settings', 'chatOn' => false, 'privateOn' => true, 'words' => 'bobo']);
check($send($bia, 'cohort', 'oi')[1]['error']['code'] === 'CHAT_OFF' && $poll($bia)['messages'] === [] && $poll($bia)['chatOn'] === false, 'o master desliga o chat do curso: ninguém manda (403 CHAT_OFF) nem recebe');
$chat->handle($mara, ['action' => 'settings', 'chatOn' => true, 'privateOn' => true, 'words' => 'bobo']);

$cursor = $poll($caio)['cursor'];
$send($ana, 'cohort', 'Agora mesmo');
$fast = $bodies($poll($caio, $cursor));
$settle();
check(!in_array('Agora mesmo', $fast, true) && in_array('Agora mesmo', $bodies($poll($caio, $cursor)), true), 'a entrega espera a mensagem ter 250 ms: ela chega na batida seguinte, e uma gravação no mesmo instante da leitura não se perde');

echo "\n== A guarda (LGPD) ==\n";
$old = static function (string $body, int $days) use ($pdo, $send, $ana): int {
    $id = $send($ana, 'cohort', $body)[1]['data']['id'];
    $pdo->exec("UPDATE spike_chat_messages SET created_at = NOW(3) - INTERVAL {$days} DAY WHERE id = {$id}");
    return $id;
};
$pdo->exec('DELETE FROM spike_chat_messages WHERE sender_id = ' . $ana->id . ' AND created_at > NOW(3) - INTERVAL 60 SECOND');
$keep89 = $old('de 89 dias', 89);
$drop91 = $old('de 91 dias', 91);
$openReport = $old('denunciada, aberta', 200);
$recent = $old('denunciada, resolvida há 2 meses', 400);
$expired = $old('denunciada, resolvida há 2 anos', 900);
foreach ([$openReport, $recent, $expired] as $id) {
    $store->report($caio, $id);
}
$pdo->exec("UPDATE spike_chat_reports SET status = 'resolved', resolved_at = UTC_TIMESTAMP() - INTERVAL 60 DAY WHERE message_id = {$recent}");
$pdo->exec("UPDATE spike_chat_reports SET status = 'resolved', resolved_at = UTC_TIMESTAMP() - INTERVAL 730 DAY WHERE message_id = {$expired}");
$gone = $store->purge();
$left = array_map('intval', $pdo->query("SELECT id FROM spike_chat_messages WHERE id IN ({$keep89}, {$drop91}, {$openReport}, {$recent}, {$expired}) ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));
check($gone >= 2 && $left === [$keep89, $openReport, $recent], 'a guarda: sai a mensagem de mais de 90 dias; fica a denunciada em aberto e a resolvida há menos de 1 ano; a resolvida há mais de 1 ano sai');
check((int) $pdo->query("SELECT COUNT(*) FROM spike_chat_reports WHERE message_id = {$expired}")->fetchColumn() === 0, 'e a denúncia vencida sai junto com a mensagem');

echo "\n== O custo da batida ==\n";
$pdo->exec('DELETE FROM spike_chat_messages');
$room = [];
for ($i = 0; $i < 47; $i++) {
    $room[] = $p = $person(1, 'a', "Robô {$i}");
    $poll($p, 0, 'cidade', ($i % 7) * 20, intdiv($i, 7) * 20);
}
for ($i = 0; $i < 20; $i++) {
    $send($room[$i], $i % 2 === 0 ? 'cohort' : 'near', "mensagem {$i} da turma cheia");
}
$settle();
$t0 = hrtime(true);
[, $full] = $chat->handle($bia, ['action' => 'poll', 'since' => 0, 'place' => 'cidade', 'x' => 30, 'z' => 0]);
$ms = (hrtime(true) - $t0) / 1e6;
$cursor = $full['data']['cursor'];
$t0 = hrtime(true);
[, $quiet] = $chat->handle($bia, ['action' => 'poll', 'since' => $cursor, 'place' => 'cidade', 'x' => 30, 'z' => 0]);
$msQuiet = (hrtime(true) - $t0) / 1e6;
printf("   turma de 48 no mesmo lugar: a batida com 20 mensagens novas leva %.1f ms e %d B; sem nada novo, %.1f ms e %d B\n", $ms, strlen((string) json_encode($full)), $msQuiet, strlen((string) json_encode($quiet)));
check($ms < 200 && $quiet['data']['messages'] === [], 'a batida com a turma cheia (48) é rápida, e sem mensagem nova vem só a sala');

echo "\n== Os endpoints de verdade (php -S) ==\n";
$port = 18000 + random_int(0, 999);
$env = sprintf('SPIKE_MYSQL_HOST=%s SPIKE_MYSQL_PORT=%s SPIKE_MYSQL_DB=%s SPIKE_MYSQL_USER=%s SPIKE_MYSQL_PASS=%s', ...array_map(static fn ($k) => escapeshellarg((string) getenv($k)), ['SPIKE_MYSQL_HOST', 'SPIKE_MYSQL_PORT', 'SPIKE_MYSQL_DB', 'SPIKE_MYSQL_USER', 'SPIKE_MYSQL_PASS']));
$server = proc_open("{$env} exec " . escapeshellarg(PHP_BINARY) . " -S 127.0.0.1:{$port} -t " . escapeshellarg("{$root}/public"), [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100000);
}
$http = static function (string $method, string $path, ?array $json, string &$cookie) use ($port): array {
    $ch = curl_init("http://127.0.0.1:{$port}/{$path}");
    $headers = ['Content-Type: application/json'];
    if ($cookie !== '') {
        $headers[] = "Cookie: {$cookie}";
    }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers] + ($json !== null ? [CURLOPT_POSTFIELDS => json_encode($json)] : []));
    $raw = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $head = substr($raw, 0, $size);
    if (preg_match('/Set-Cookie: (spike_chat=[^;]+)/i', $head, $m)) {
        $cookie = $m[1];
    }
    return [$code, json_decode(substr($raw, $size), true), $head];
};
try {
    $none = '';
    check($http('POST', 'chat.php', ['action' => 'poll', 'since' => 0, 'place' => 'cidade', 'x' => 0, 'z' => 0], $none)[0] === 401 && $http('GET', 'chat.php', null, $none)[0] === 405, 'sem sessão, 401; GET, 405');
    // As janelas anônimas dividem os cookies: duas pessoas entram pela MESMA sessão, e cada aba diz qual é a dela.
    $jar = '';
    [$c, $first] = $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'boreal', 'cohort' => 'b', 'role' => 'student'], $jar);
    [, $second] = $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'boreal', 'cohort' => 'b', 'role' => 'student'], $jar);
    $one = $first['data']['id'] ?? 0;
    $two = $second['data']['id'] ?? 0;
    $poll2 = ['action' => 'poll', 'since' => 0, 'place' => 'cidade', 'x' => 0, 'z' => 0];
    $http('POST', 'chat.php', ['as' => $two] + $poll2, $jar);
    [$c2] = $http('POST', 'chat.php', ['as' => $one, 'action' => 'send', 'channel' => 'cohort', 'body' => 'Olá pela rede', 'from' => $two], $jar);
    usleep(300000);
    [$c3, $got, $head] = $http('POST', 'chat.php', ['as' => $two] + $poll2, $jar);
    $msg = $got['data']['messages'][0] ?? [];
    check($c === 200 && $one !== $two && $c2 === 201 && $c3 === 200 && ($got['data']['me']['id'] ?? 0) === $two && ($msg['body'] ?? '') === 'Olá pela rede' && ($msg['from']['id'] ?? 0) === $one && stripos($head, 'Cache-Control: no-store') !== false, 'duas abas na mesma sessão são duas pessoas: cada uma fala por si, e o "from" do pedido não vale (no-store)');
    $other = '';
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'boreal', 'cohort' => 'b', 'role' => 'student'], $other);
    check($http('POST', 'chat.php', ['as' => $one] + $poll2, $other)[0] === 401 && $http('POST', 'chat.php', $poll2, $jar)[0] === 401, 'uma sessão não fala por uma pessoa que entrou por outra (401), e sem dizer a pessoa da aba também é 401');
} finally {
    proc_terminate($server);
}

echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
exit($failed ? 1 : 0);
