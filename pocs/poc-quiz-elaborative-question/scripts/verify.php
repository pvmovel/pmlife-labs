<?php
declare(strict_types=1);

// Prova a PoC da US59: a questão em 2 etapas (a resposta e o porquê), sobre o quiz corrigido no servidor da US58.
// Sem banco: a nota com meio ponto, o crédito das 2 etapas e a regra das tentativas (os casos de cases/, os mesmos do
// TypeScript), o sorteio pela semente e a correção de cada formato. Com um MySQL (SPIKE_MYSQL_*): o serviço com o
// relógio andando e a API de verdade pelo servidor embutido do PHP (o gabarito e o porquê certo nunca no navegador, o
// meio ponto, o XP uma vez, a espera, o CSRF e a sessão).
// ATENÇÃO: o script apaga e recria as tabelas poc_eq_* do banco informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Poc\Quiz\AttemptRules;
use Poc\Quiz\Draw;
use Poc\Quiz\Graders;
use Poc\Quiz\QuizService;
use Poc\Quiz\QuizStore;

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

echo "== A nota, o crédito das 2 etapas e as tentativas, sem banco (os casos de cases/, os mesmos do TypeScript) ==\n";
foreach (glob("{$root}/cases/*.json") ?: [] as $file) {
    $c = json_decode((string) file_get_contents($file), true);
    if ($c['type'] === 'score') {
        $got = ['score' => AttemptRules::score($c['points'], $c['total']), 'passed' => AttemptRules::passing($c['points'], $c['total'], $c['passPercent'])];
    } elseif ($c['type'] === 'credit') {
        $got = AttemptRules::twoStepCredit($c['answerRight'], $c['reasonRight'], $c['halfCredit']);
        $got = floor($got) === $got ? (int) $got : $got;
    } else {
        $got = AttemptRules::gate($c['attempts'], $c['policy'], $c['now']);
    }
    check($got === $c['expect'], basename($file) . ': ' . $c['description']);
}

echo "\n== O sorteio pela semente ==\n";
$bank = range(1, 20);
$a = Draw::questions(12345, $bank, 5);
check($a === Draw::questions(12345, $bank, 5) && count($a) === 5 && count(array_unique($a)) === 5 && array_diff($a, $bank) === [], 'a mesma semente dá as mesmas 5 questões, sem repetir e todas do banco (a correção refaz o sorteio)');
$seen = array_fill_keys($bank, 0);
$distinct = [];
for ($s = 1; $s <= 2000; $s++) {
    $d = Draw::questions($s, $bank, 5);
    $distinct[implode(',', $d)] = true;
    foreach ($d as $q) {
        $seen[$q]++;
    }
}
check(min($seen) > 380 && max($seen) < 620, 'em 2.000 sorteios, cada questão aparece perto das 500 vezes esperadas (' . min($seen) . ' a ' . max($seen) . ')');
check(count($distinct) > 1990, 'em 2.000 sorteios, ' . count($distinct) . ' provas diferentes (duas tentativas quase nunca repetem)');
$orders = [];
for ($s = 1; $s <= 200; $s++) {
    $orders[implode('', Draw::order($s, 'o7', ['a', 'b', 'c', 'd']))] = true;
}
check(count($orders) === 24, 'as alternativas saem em todas as 24 ordens possíveis de 4 (embaralhamento por questão)');
check(Draw::order(1, 'o7', ['a', 'b', 'c', 'd']) !== Draw::order(1, 'o8', ['a', 'b', 'c', 'd']) || Draw::order(2, 'o7', ['a', 'b', 'c', 'd']) !== Draw::order(2, 'o8', ['a', 'b', 'c', 'd']), 'cada questão embaralha com a própria etiqueta (a mesma semente não dá a mesma ordem em todas)');

echo "\n== A correção de cada formato (tudo ou nada) ==\n";
$opts = ['options' => [['id' => 'a', 'text' => 'A'], ['id' => 'b', 'text' => 'B'], ['id' => 'c', 'text' => 'C']]];
check(Graders::grade('single', $opts, ['option' => 'b'], ['option' => 'b']) && !Graders::grade('single', $opts, ['option' => 'b'], ['option' => 'a']) && !Graders::grade('single', $opts, ['option' => 'b'], ['option' => 'z']), 'escolha única: só a alternativa certa; um id que não é da questão vale como errado');
check(Graders::grade('multiple', $opts, ['options' => ['a', 'c']], ['options' => ['c', 'a']]) && !Graders::grade('multiple', $opts, ['options' => ['a', 'c']], ['options' => ['a']]) && !Graders::grade('multiple', $opts, ['options' => ['a', 'c']], ['options' => ['a', 'b', 'c']]) && !Graders::grade('multiple', $opts, ['options' => ['a', 'c']], ['options' => ['a', 'a', 'c']]), 'múltipla: todas as certas e nenhuma errada, em qualquer ordem (marcar todas não passa; repetir não vale)');
check(Graders::grade('truefalse', [], ['value' => false], ['value' => false]) && !Graders::grade('truefalse', [], ['value' => false], ['value' => true]) && !Graders::grade('truefalse', [], ['value' => false], ['value' => 'false']), 'verdadeiro ou falso: só o booleano certo ("false" em texto não vale)');
$cloze = ['text' => '{1} {2}', 'blanks' => ['1' => ['x', 'y'], '2' => ['p', 'q']]];
check(Graders::grade('cloze', $cloze, ['blanks' => ['1' => 'x', '2' => 'q']], ['blanks' => ['1' => 'x', '2' => 'q']]) && !Graders::grade('cloze', $cloze, ['blanks' => ['1' => 'x', '2' => 'q']], ['blanks' => ['1' => 'x', '2' => 'p']]) && !Graders::grade('cloze', $cloze, ['blanks' => ['1' => 'x', '2' => 'q']], ['blanks' => ['1' => 'x']]) && !Graders::grade('cloze', $cloze, ['blanks' => ['1' => 'x', '2' => 'q']], ['blanks' => ['1' => 'x', '2' => 'outra']]), 'lacunas: todas certas; uma lacuna faltando ou fora das opções vale como errada');
$items = ['items' => [['id' => 'm', 'text' => 'M'], ['id' => 'v', 'text' => 'V'], ['id' => 't', 'text' => 'T']]];
check(Graders::grade('ordering', $items, ['order' => ['m', 'v', 't']], ['order' => ['m', 'v', 't']]) && !Graders::grade('ordering', $items, ['order' => ['m', 'v', 't']], ['order' => ['v', 'm', 't']]) && !Graders::grade('ordering', $items, ['order' => ['m', 'v', 't']], ['order' => ['m', 'v']]) && !Graders::grade('ordering', $items, ['order' => ['m', 'v', 't']], ['order' => ['m', 'm', 't']]), 'ordenação: a ordem exata; faltando ou repetindo item vale como errada');
check(!Graders::grade('single', $opts, ['option' => 'a'], null) && !Graders::grade('ordering', $items, ['order' => ['m', 'v', 't']], 'm,v,t'), 'sem resposta (ou num formato estranho), a questão conta como errada, sem erro');

echo "\n== A questão em 2 etapas (US59): a resposta e o porquê ==\n";
$reasons = [['id' => 'r1', 'text' => 'R1'], ['id' => 'r2', 'text' => 'R2'], ['id' => 'r3', 'text' => 'R3']];
$two = ['first' => 'single'] + $opts + ['reasonPrompt' => 'Por quê?', 'reasons' => $reasons, 'halfCredit' => false];
$twoHalf = ['halfCredit' => true] + $two;
$key = ['option' => 'b', 'reason' => 'r2'];
check(Graders::score('twostep', $two, $key, ['option' => 'b', 'reason' => 'r2']) === ['credit' => 1.0, 'steps' => ['answer' => true, 'reason' => true]], 'a resposta e o porquê certos: 1 ponto, com as duas etapas certas');
check(Graders::score('twostep', $two, $key, ['option' => 'b', 'reason' => 'r1']) === ['credit' => 0.0, 'steps' => ['answer' => true, 'reason' => false]], 'Gherkin "Resposta certa, porquê errado": sem o meio ponto, vale 0, e a devolutiva diz que só o porquê errou');
check(Graders::score('twostep', $twoHalf, $key, ['option' => 'b', 'reason' => 'r1'])['credit'] === 0.5, 'com o meio ponto do autor, a resposta certa e o porquê errado valem 0,5');
check(Graders::score('twostep', $twoHalf, $key, ['option' => 'a', 'reason' => 'r2'])['credit'] === 0.0, 'o porquê certo com a resposta errada vale 0, mesmo com o meio ponto');
$tf = ['first' => 'truefalse', 'reasonPrompt' => 'Por quê?', 'reasons' => $reasons, 'halfCredit' => true];
check(Graders::score('twostep', $tf, ['value' => false, 'reason' => 'r3'], ['value' => false, 'reason' => 'r3'])['credit'] === 1.0 && Graders::score('twostep', $tf, ['value' => false, 'reason' => 'r3'], ['value' => false, 'reason' => 'r1'])['credit'] === 0.5, 'a 1ª etapa em verdadeiro ou falso: as duas certas valem 1; só "Falso" certo, 0,5');
check(Graders::score('twostep', $two, $key, ['option' => 'b'])['credit'] === 0.0 && Graders::score('twostep', $two, $key, ['option' => 'b', 'reason' => 'r9'])['credit'] === 0.0 && Graders::score('twostep', $two, $key, ['value' => true, 'reason' => 'r2'])['credit'] === 0.0 && Graders::score('twostep', $twoHalf, $key, null) === ['credit' => 0.0, 'steps' => ['answer' => false, 'reason' => false]], 'sem o porquê, com um porquê que não é da questão ou com a resposta no formato errado, vale 0 (e o meio ponto não salva)');
check(Graders::grade('twostep', $two, $key, ['option' => 'b', 'reason' => 'r2']) && !Graders::grade('twostep', $twoHalf, $key, ['option' => 'b', 'reason' => 'r1']), 'a questão "inteira" é só com as duas certas (o meio ponto não é acerto)');
check(!Graders::for('twostep')->valid(['first' => 'multiple'] + $two, ['options' => ['b'], 'reason' => 'r2']), 'a 1ª etapa só pode ser escolha única ou verdadeiro ou falso (decisão do Pablo)');

$host = getenv('SPIKE_MYSQL_HOST');
if (!$host) {
    echo "\n⚠️  Sem SPIKE_MYSQL_*: só as regras foram testadas.\n";
    echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
    exit($failed ? 1 : 0);
}

$pdo = quiz_pdo();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "\n== O serviço no MySQL {$version}, com o relógio andando ==\n";
foreach (['poc_eq_attempts', 'poc_eq_questions', 'poc_eq_quizzes'] as $t) {
    $pdo->exec("DROP TABLE IF EXISTS {$t}");
}
foreach (glob("{$root}/migrations/mysql/*.sql") ?: [] as $sql) {
    foreach (array_filter(array_map('trim', explode(";\n", (string) preg_replace('/^--.*$/m', '', (string) file_get_contents($sql))))) as $stmt) {
        $pdo->exec($stmt);
    }
}
$pdo->exec("UPDATE poc_eq_quizzes SET cooldown_seconds = 600 WHERE id = 'porque'");
$now = 1_800_000_000;
$store = new QuizStore($pdo);
$service = new QuizService($store, static function () use (&$now): int {
    return $now;
});
check(count($store->questionIds('porque')) === 10 && (int) $pdo->query("SELECT COUNT(*) FROM poc_eq_questions WHERE kind = 'twostep'")->fetchColumn() === 7 && (int) $pdo->query("SELECT COUNT(*) FROM poc_eq_questions WHERE kind = 'twostep' AND content LIKE '%\"halfCredit\": true%'")->fetchColumn() === 3, 'o banco de exemplo tem 10 questões, 7 delas em 2 etapas (3 com o meio ponto)');

/** As respostas certas (ou a primeira errada possível) das questões de uma tentativa, lidas do banco como só o servidor lê. */
$answersFor = static function (array $questions, int $wrong) use ($store): array {
    $bank = $store->questions('porque', array_column($questions, 'id'));
    $out = [];
    foreach ($questions as $i => $q) {
        $right = $bank[$q['id']]['answer'];
        if ($i >= count($questions) - $wrong) {
            $right = match ($q['kind']) {
                'single' => ['option' => $right['option'] === 'a' ? 'b' : 'a'],
                'multiple' => ['options' => array_values(array_slice($right['options'], 1))],
                'truefalse' => ['value' => !$right['value']],
                'cloze' => ['blanks' => array_map(static fn (string $v, array $b): string => $b['choices'][0] === $v ? $b['choices'][1] : $b['choices'][0], $right['blanks'], $q['blanks'])],
                'ordering' => ['order' => array_reverse($right['order'])],
                // Errar a 1ª etapa: vale 0 mesmo com o meio ponto.
                'twostep' => array_key_exists('option', $right) ? ['option' => $right['option'] === 'a' ? 'b' : 'a', 'reason' => $right['reason']] : ['value' => !$right['value'], 'reason' => $right['reason']],
            };
        }
        $out[(string) $q['id']] = $right;
    }
    return $out;
};

$ana = 'aaaaaaaaaaaaaaaa';
$s1 = $service->start('porque', $ana);
$again = $service->start('porque', $ana);
check($s1['ok'] && count($s1['questions']) === 5 && $again['attemptId'] === $s1['attemptId'] && $again['resumed'] && array_column($again['questions'], 'id') === array_column($s1['questions'], 'id'), 'abrir de novo continua a mesma tentativa, com as mesmas questões (não dá para sortear até achar questões fáceis)');
$r = $service->submit('porque', $ana, $s1['attemptId'], $answersFor($s1['questions'], 1));
check($r['ok'] && $r['points'] === 4 && $r['score'] === 80 && $r['passed'] && $r['firstPass'] && $r['xp'] === 100, 'Gherkin "Aprovação dá XP uma vez": 4 de 5 com a nota de corte de 70% aprova e dá o XP');
check(count(array_filter($r['results'], static fn (array $x): bool => !$x['correct'])) === 1 && array_filter($r['results'], static fn (array $x): bool => array_key_exists('answer', $x)) === [], 'a devolutiva diz qual errou, sem a resposta certa');
check($service->submit('porque', $ana, $s1['attemptId'], $answersFor($s1['questions'], 0))['code'] === 'ATTEMPT_CLOSED', 'a mesma tentativa não é enviada duas vezes');
$s2 = $service->start('porque', $ana);
$r2 = $service->submit('porque', $ana, $s2['attemptId'], $answersFor($s2['questions'], 0));
check($r2['passed'] && $r2['score'] === 100 && !$r2['firstPass'] && $r2['xp'] === 0, 'uma nova aprovação (100%) não soma XP de novo');

$bia = 'bbbbbbbbbbbbbbbb';
$b1 = $service->start('porque', $bia);
check($b1['attemptId'] !== $s1['attemptId'] && $service->submit('porque', $ana, $b1['attemptId'], [])['code'] === 'ATTEMPT_NOT_FOUND', 'cada aluno tem a própria tentativa; a de outra pessoa não existe para quem pede');
$rb = $service->submit('porque', $bia, $b1['attemptId'], $answersFor($b1['questions'], 2));
check(!$rb['passed'] && $rb['score'] === 60 && $rb['xp'] === 0 && $rb['gate']['reason'] === 'cooldown' && $rb['gate']['waitSeconds'] === 600, 'reprovada com 60%: sem XP, e a espera de 10 minutos começa');
$now += 60;
$blocked = $service->start('porque', $bia);
check(!$blocked['ok'] && $blocked['code'] === 'QUIZ_COOLDOWN' && $blocked['waitSeconds'] === 540, 'Gherkin "Espera entre tentativas": tentando de novo 1 minuto depois, faltam 9 minutos (540 s)');
$now += 540;
$b2 = $service->start('porque', $bia);
check($b2['ok'] && !$b2['resumed'] && array_column($b2['questions'], 'id') !== array_column($b1['questions'], 'id'), 'passada a espera, a nova tentativa sorteia outras questões');
$extra = $answersFor($b2['questions'], 0) + ['999999' => ['option' => 'a']];
check($service->submit('porque', $bia, $b2['attemptId'], $extra)['points'] === 5, 'resposta para uma questão que não foi sorteada é ignorada: só contam as da semente');

// US59: o meio ponto na prova. Uma tentativa com questões em 2 etapas: todas certas, menos o porquê de uma com o meio
// ponto (0,5) e o de uma sem (0). As outras questões contam inteiras.
$withHalf = null;
for ($k = 0; $k < 40 && $withHalf === null; $k++) {
    $who = sprintf('h%015d', $k);
    $h = $service->start('porque', $who);
    $hb = $store->questions('porque', array_column($h['questions'], 'id'));
    $kinds = array_map(static fn (array $q): string => $q['kind'] === 'twostep' ? ($q['halfCredit'] ? 'half' : 'whole') : 'other', $h['questions']);
    if (in_array('half', $kinds, true) && in_array('whole', $kinds, true)) {
        $withHalf = [$who, $h, $hb, $kinds];
    }
}
[$who, $h, $hb, $kinds] = $withHalf;
$ans = $answersFor($h['questions'], 0);
$wrongReason = static function (array $right): array {
    return ['reason' => $right['reason'] === 'r1' ? 'r2' : 'r1'] + $right;
};
$halfId = $h['questions'][array_search('half', $kinds, true)]['id'];
$wholeId = $h['questions'][array_search('whole', $kinds, true)]['id'];
$ans[(string) $halfId] = $wrongReason($ans[(string) $halfId]);
$ans[(string) $wholeId] = $wrongReason($ans[(string) $wholeId]);
$rh = $service->submit('porque', $who, $h['attemptId'], $ans);
$byId = array_column($rh['results'], null, 'id');
check($rh['points'] === 3.5 && $rh['score'] === 70 && $rh['passed'], 'com o porquê errado numa questão com meio ponto e noutra sem: 3,5 de 5, 70%, aprovado no limite da nota de corte');
check($byId[$halfId]['credit'] === 0.5 && $byId[$halfId]['correct'] === false && $byId[$halfId]['steps'] === ['answer' => true, 'reason' => false], 'a devolutiva da questão com meio ponto: 0,5, a resposta certa e o porquê errado');
check($byId[$wholeId]['credit'] === 0 && $byId[$wholeId]['steps'] === ['answer' => true, 'reason' => false] && isset($byId[$wholeId]['rationale']), 'Gherkin "Resposta certa, porquê errado": a questão sem meio ponto vale 0, e a explicação do porquê aparece');
check((int) $pdo->query("SELECT half_points FROM poc_eq_attempts WHERE id = {$h['attemptId']}")->fetchColumn() === 7, 'a tentativa guarda os pontos em meios pontos inteiros (3,5 ➔ 7)');
check(array_filter($rh['results'], static fn (array $x): bool => isset($x['answer']) || isset($x['reason'])) === [], 'a devolutiva não diz qual era o porquê certo');

$pdo->exec("UPDATE poc_eq_quizzes SET max_attempts = 2 WHERE id = 'porque'");
$caio = 'cccccccccccccccc';
foreach ([1, 2] as $_) {
    $c = $service->start('porque', $caio);
    $service->submit('porque', $caio, $c['attemptId'], []);
    $now += 601;
}
check($service->start('porque', $caio)['code'] === 'QUIZ_NO_ATTEMPTS' && $service->state('porque', $caio)['gate']['remaining'] === 0, 'com o limite de 2 tentativas usado, o quiz não abre mais');
$pdo->exec("UPDATE poc_eq_quizzes SET max_attempts = NULL WHERE id = 'porque'");

echo "\n== A API de verdade (php -S) ==\n";
$pdo->exec("UPDATE poc_eq_quizzes SET cooldown_seconds = 600 WHERE id = 'porque'");
$port = 18000 + random_int(0, 999);
$env = sprintf('SPIKE_MYSQL_HOST=%s SPIKE_MYSQL_PORT=%s SPIKE_MYSQL_DB=%s SPIKE_MYSQL_USER=%s SPIKE_MYSQL_PASS=%s', ...array_map(static fn ($k) => escapeshellarg((string) getenv($k)), ['SPIKE_MYSQL_HOST', 'SPIKE_MYSQL_PORT', 'SPIKE_MYSQL_DB', 'SPIKE_MYSQL_USER', 'SPIKE_MYSQL_PASS']));
$server = proc_open("{$env} exec " . escapeshellarg(PHP_BINARY) . " -S 127.0.0.1:{$port} -t " . escapeshellarg("{$root}/public"), [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100000);
}
$http = static function (string $method, ?array $json, string &$cookie, ?string $csrf = null) use ($port): array {
    $ch = curl_init("http://127.0.0.1:{$port}/quiz.php");
    $headers = ['Content-Type: application/json'];
    if ($cookie !== '') {
        $headers[] = "Cookie: {$cookie}";
    }
    if ($csrf !== null) {
        $headers[] = "X-CSRF-Token: {$csrf}";
    }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers] + ($json !== null ? [CURLOPT_POSTFIELDS => json_encode($json)] : []));
    $raw = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if (preg_match('/Set-Cookie: (poc_eq=[^;]+)/i', substr($raw, 0, $size), $m)) {
        $cookie = $m[1];
    }
    $body = substr($raw, $size);
    return [$code, json_decode($body, true), $body];
};
try {
    $dani = '';
    [$c, $state] = $http('GET', null, $dani);
    $csrf = (string) ($state['data']['csrf'] ?? '');
    check($c === 200 && $state['data']['quiz']['drawCount'] === 5 && $state['data']['quiz']['bank'] === 10 && $state['data']['gate']['canStart'] === true && strlen($csrf) === 32, 'a aluna abre a página: o quiz (5 de 10, nota de corte de 70%) e o token CSRF da sessão');
    check($http('POST', ['action' => 'start'], $dani)[0] === 403 && $http('POST', ['action' => 'start'], $dani, 'outro')[0] === 403, 'sem o X-CSRF-Token da sessão (ou com outro), o POST é recusado (403)');
    [$c, $start, $raw] = $http('POST', ['action' => 'start'], $dani, $csrf);
    $qs = $start['data']['questions'] ?? [];
    check($c === 200 && count($qs) === 5, 'Gherkin "Sorteio N de X": a tentativa traz as 5 questões sorteadas pelo servidor');
    $secret = $store->questions('porque', array_column($qs, 'id'));
    $leak = false;
    foreach ($qs as $q) {
        $leak = $leak || array_key_exists('answer', $q) || array_key_exists('rationale', $q) || ($secret[$q['id']]['rationale'] !== null && str_contains($raw, (string) json_encode($secret[$q['id']]['rationale'], JSON_UNESCAPED_UNICODE)));
    }
    check(!$leak && !str_contains($raw, '"answer"') && !str_contains($raw, '"rationale"') && !str_contains($raw, '"seed"') && !str_contains($raw, '"reason"'), 'o gabarito nunca vai ao navegador: a resposta não tem o gabarito, o porquê certo, a justificativa nem a semente');
    $twoSteps = array_values(array_filter($qs, static fn (array $q): bool => $q['kind'] === 'twostep'));
    $shape = true;
    foreach ($twoSteps as $q) {
        $shape = $shape && count($q['reasons']) === 3 && is_string($q['reasonPrompt']) && is_bool($q['halfCredit']) && ($q['first'] === 'truefalse' ? !isset($q['options']) : count($q['options']) === 3);
    }
    check($twoSteps !== [] && $shape, 'a questão em 2 etapas chega com a 1ª etapa, os 3 porquês e se vale meio ponto (' . count($twoSteps) . ' nesta prova)');
    $twice = [];
    $other = '';
    $http('GET', null, $other);
    for ($k = 0; $k < 2; $k++) {
        $person = '';
        $tok = $http('GET', null, $person)[1]['data']['csrf'];
        $twice[] = $http('POST', ['action' => 'start'], $person, $tok)[1]['data']['questions'];
    }
    $optionOrder = static fn (array $questions): string => (string) json_encode(array_map(static fn (array $q): array => [$q['id'], array_column($q['options'] ?? $q['items'] ?? [], 'id')], $questions));
    check(array_column($twice[0], 'id') !== array_column($twice[1], 'id') || $optionOrder($twice[0]) !== $optionOrder($twice[1]), 'duas tentativas (de duas pessoas) sorteiam provas diferentes');
    $shuffled = false;
    foreach ($qs as $q) {
        $ids = array_column($q['options'] ?? $q['items'] ?? [], 'id');
        $orig = array_column($secret[$q['id']]['content']['options'] ?? $secret[$q['id']]['content']['items'] ?? [], 'id');
        $shuffled = $shuffled || ($ids !== [] && $ids !== $orig);
    }
    $everShuffled = $shuffled;
    for ($k = 0; $k < 6 && !$everShuffled; $k++) {
        $person = '';
        $tok = $http('GET', null, $person)[1]['data']['csrf'];
        foreach ($http('POST', ['action' => 'start'], $person, $tok)[1]['data']['questions'] as $q) {
            $ids = array_column($q['options'] ?? $q['items'] ?? [], 'id');
            $all = $store->questions('porque', [$q['id']])[$q['id']]['content'];
            $everShuffled = $everShuffled || ($ids !== [] && $ids !== array_column($all['options'] ?? $all['items'] ?? [], 'id'));
        }
    }
    check($everShuffled, 'Gherkin "Sorteio N de X": as alternativas e os itens vêm embaralhados (fora da ordem do banco)');
    [$c, $sub] = $http('POST', ['action' => 'submit', 'attemptId' => $start['data']['attemptId'], 'answers' => $answersFor($qs, 1)], $dani, $csrf);
    $withRationale = array_filter($sub['data']['results'] ?? [], static fn (array $x): bool => isset($x['rationale']));
    check($c === 200 && $sub['data']['score'] === 80 && $sub['data']['passed'] && $sub['data']['xp'] === 100 && $sub['data']['totalXp'] === 100, 'enviada com 4 de 5: aprovada, com 100 XP na sessão');
    check(count($sub['data']['results']) === 5 && count($withRationale) === count(array_filter($secret, static fn (array $q): bool => $q['rationale'] !== null)), 'a devolutiva: certo ou errado em cada questão e a justificativa de cada uma que tem (decisão do Pablo)');
    [$c, $dup] = $http('POST', ['action' => 'submit', 'attemptId' => $start['data']['attemptId'], 'answers' => []], $dani, $csrf);
    check($c === 409 && $dup['error']['code'] === 'ATTEMPT_CLOSED', 'enviar de novo a mesma tentativa: 409');
    $s3 = $http('POST', ['action' => 'start'], $dani, $csrf)[1]['data'];
    $again3 = $http('POST', ['action' => 'submit', 'attemptId' => $s3['attemptId'], 'answers' => $answersFor($s3['questions'], 0)], $dani, $csrf)[1]['data'];
    check($again3['passed'] && $again3['xp'] === 0 && $again3['totalXp'] === 100, 'Gherkin "Aprovação dá XP uma vez": aprovada de novo, o XP continua 100');
    $eva = '';
    $evaTok = $http('GET', null, $eva)[1]['data']['csrf'];
    $e1 = $http('POST', ['action' => 'start'], $eva, $evaTok)[1]['data'];
    check($http('POST', ['action' => 'submit', 'attemptId' => $s3['attemptId'], 'answers' => []], $eva, $evaTok)[0] === 404, 'a tentativa de outra pessoa: 404 (o aluno vem só da sessão)');
    $http('POST', ['action' => 'submit', 'attemptId' => $e1['attemptId'], 'answers' => []], $eva, $evaTok);
    [$c, $cool] = $http('POST', ['action' => 'start'], $eva, $evaTok);
    $evaState = $http('GET', null, $eva)[1]['data'];
    check($c === 429 && $cool['error']['code'] === 'QUIZ_COOLDOWN' && $cool['error']['waitSeconds'] > 590 && $evaState['gate']['reason'] === 'cooldown' && $evaState['best'] === 0, 'Gherkin "Espera entre tentativas": reprovada, tentar de novo dá 429 com quanto falta (perto de 600 s)');
    check($http('POST', ['action' => 'oi'], $eva, $evaTok)[0] === 400 && $http('PUT', null, $eva, $evaTok)[0] === 405, 'pedido desconhecido: 400; outro método: 405');
} finally {
    proc_terminate($server);
}

echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
exit($failed ? 1 : 0);
