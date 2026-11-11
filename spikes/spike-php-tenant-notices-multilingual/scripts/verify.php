<?php
declare(strict_types=1);

// Prova o spike da US40: os avisos da instituição num módulo próprio em PHP e MySQL, sem WordPress.
// Sem banco: as regras (o lugar, o pt obrigatório e o en inteiro ou nada, quem publica, o idioma com recuo e o ETag).
// Com um MySQL (SPIKE_MYSQL_*): o mural de verdade (a ordem, o isolamento, a correção e a exclusão só na própria
// instituição) e os endpoints pelo servidor embutido do PHP (a sessão, o 403, o ETag com 304 e a correção que chega).
// ATENÇÃO: o script apaga e recria a tabela spike_notices do banco informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Notices\Author;
use Spike\Notices\NoticeRules;
use Spike\Notices\NoticeService;
use Spike\Notices\NoticeStore;

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

$aviso = static fn (array $over = []): array => array_replace_recursive([
    'place' => 'hq',
    'title' => ['pt-BR' => 'Prova na sexta', 'en-US' => 'Exam on Friday'],
    'body' => ['pt-BR' => '**Sala 3**, às 14h.', 'en-US' => '**Room 3**, at 2 pm.'],
], $over);

echo "== As regras, sem banco ==\n";
check(NoticeRules::validPlace('hq') && NoticeRules::validPlace('course:dev-to-pm') && NoticeRules::validPlace('phase:aurora.trilha:fase-1')
    && !NoticeRules::validPlace('sede') && !NoticeRules::validPlace('course:') && !NoticeRules::validPlace("hq' OR 1=1"), 'o lugar: a sede, a cidade de um curso ou uma fase; o resto é recusado');
[$ok] = NoticeRules::validate($aviso(['title' => ['en-US' => ''], 'body' => ['en-US' => '']]));
check($ok !== null && $ok['title_en'] === null, 'só em pt-BR: aceito (o en-US é opcional)');
[, $errors] = NoticeRules::validate($aviso(['title' => ['pt-BR' => '  ']]));
check(isset($errors['title.pt-BR']), 'sem o título em pt-BR: recusado');
[, $errors] = NoticeRules::validate($aviso(['body' => ['en-US' => '']]));
check(($errors['en-US'] ?? '') === 'EN_INCOMPLETE', 'o en-US pela metade (título sem corpo): recusado, para não misturar idiomas');
[, $errors] = NoticeRules::validate($aviso(['body' => ['pt-BR' => str_repeat('a', NoticeRules::BODY_MAX + 1)]]));
check(isset($errors['body.pt-BR']), 'corpo acima de 20 mil caracteres: recusado');
$master = new Author(1, 'Master', 'master');
$autor = new Author(1, 'Autor', 'author', ['dev-to-pm']);
$aluno = new Author(1, 'Aluno', 'student');
check(NoticeRules::canPublish($master, 'hq') && NoticeRules::canPublish($autor, 'phase:dev-to-pm:fase-1') && !NoticeRules::canPublish($autor, 'hq')
    && !NoticeRules::canPublish($autor, 'course:outro') && !NoticeRules::canPublish($aluno, 'course:dev-to-pm'), 'quem publica: o master em qualquer lugar; o autor só no curso dele; o aluno nunca');
$row = ['id' => 1, 'title_pt' => 'Prova', 'body_pt' => 'pt', 'title_en' => null, 'body_en' => null, 'pinned' => 0, 'author' => 'M', 'published_at' => 'x', 'updated_at' => 'y'];
$pick = NoticeRules::pick($row, 'en-US');
check($pick['language'] === 'pt-BR' && $pick['fallback'] === true && NoticeRules::pick($row + ['title_en' => 'Exam'], 'pt-BR')['fallback'] === false, 'sem en-US, quem lê em inglês recebe o pt-BR marcado como recuo');
check(NoticeRules::etag([$row], 'pt-BR') !== NoticeRules::etag([['updated_at' => 'z'] + $row], 'pt-BR') && NoticeRules::etag([$row], 'pt-BR') !== NoticeRules::etag([$row], 'en-US'), 'o ETag muda com uma correção e com o idioma');

$host = getenv('SPIKE_MYSQL_HOST');
if (!$host) {
    echo "\n⚠️  Sem SPIKE_MYSQL_*: só as regras foram testadas.\n";
    echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
    exit($failed ? 1 : 0);
}

$pdo = notices_pdo();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "\n== O mural, no MySQL {$version} ==\n";
$pdo->exec('DROP TABLE IF EXISTS spike_notices');
$pdo->exec((string) file_get_contents("{$root}/migrations/mysql/001_create_spike_notices.sql"));
$service = new NoticeService(new NoticeStore($pdo));
$boreal = new Author(2, 'Master Boreal', 'master');

[$s, $b] = $service->write($master, ['action' => 'create'] + $aviso());
$id = $b['data']['id'] ?? 0;
check($s === 201 && $id > 0, 'o master da Aurora publica um aviso na sede, em pt-BR e en-US');
$service->write($master, ['action' => 'create'] + $aviso(['title' => ['pt-BR' => 'Boas-vindas', 'en-US' => ''], 'body' => ['pt-BR' => 'Olá!', 'en-US' => ''], 'pinned' => true]));
[$s, $b, $h] = $service->read($aluno, 'hq', 'en-US', null);
$items = $b['data']['notices'] ?? [];
check($s === 200 && ($items[0]['title'] ?? '') === 'Boas-vindas' && ($items[0]['fallback'] ?? false) === true && ($items[1]['title'] ?? '') === 'Exam on Friday', 'Gherkin: o aluno da Aurora lê em inglês; o fixado vem primeiro, e o aviso só em pt-BR vem marcado como recuo');
check(($b['data']['canPublish'] ?? true) === false && ($h['Cache-Control'] ?? '') === 'no-cache' && str_starts_with($h['ETag'] ?? '', '"'), 'o aluno não publica; a resposta vem com ETag e no-cache');
[$s, $b] = $service->read($boreal, 'hq', 'pt-BR', null);
check($s === 200 && $b['data']['notices'] === [], 'Gherkin: o aluno de outra instituição (Boreal) não vê o aviso da Aurora');
check($service->write($boreal, ['action' => 'update', 'id' => $id] + $aviso())[0] === 404 && $service->write($boreal, ['action' => 'delete', 'id' => $id, 'place' => 'hq'])[0] === 404, 'a Boreal também não corrige nem apaga o aviso da Aurora (404, sem dizer que ele existe)');
check($service->write($aluno, ['action' => 'create'] + $aviso())[0] === 403 && $service->write($autor, ['action' => 'create'] + $aviso())[0] === 403, 'o aluno, e o autor na sede, recebem 403');
check($service->write($autor, ['action' => 'create'] + $aviso(['place' => 'course:dev-to-pm']))[0] === 201, 'o autor publica na cidade do curso dele');
[$s, $b] = $service->write($master, ['action' => 'create'] + $aviso(['title' => ['en-US' => 'Só título']] + ['body' => ['en-US' => '']]));
check($s === 422 && ($b['error']['fields']['en-US'] ?? '') === 'EN_INCOMPLETE', 'o aviso inválido volta com o campo e o motivo (422)');
[, , $h] = $service->read($aluno, 'hq', 'pt-BR', null);
$etag = $h['ETag'];
check($service->read($aluno, 'hq', 'pt-BR', $etag)[0] === 304 && $service->read($aluno, 'hq', 'pt-BR', 'W/' . $etag)[0] === 304, 'nada mudou: 304, sem corpo (também com o ETag fraco, W/, que a CDN pode devolver)');
usleep(2000);
$service->write($master, ['action' => 'update', 'id' => $id] + $aviso(['title' => ['pt-BR' => 'Prova na sexta (sala 4)']]));
[$s, $b] = $service->read($aluno, 'hq', 'pt-BR', $etag);
check($s === 200 && in_array('Prova na sexta (sala 4)', array_column($b['data']['notices'], 'title'), true), 'Gherkin: a instituição corrige, e o mesmo ETag agora recebe 200 com a correção (sem Ctrl+F5)');
check($service->write($master, ['action' => 'delete', 'id' => $id, 'place' => 'hq'])[0] === 200 && count($service->read($aluno, 'hq', 'pt-BR', null)[1]['data']['notices']) === 1, 'o master apaga, e o aviso some do mural');
$sizes = [];
foreach ([1, 10, 50] as $n) {
    $pdo->exec('DELETE FROM spike_notices');
    for ($i = 0; $i < $n; $i++) {
        $service->write($master, ['action' => 'create'] + $aviso(['body' => ['pt-BR' => str_repeat('Texto do aviso com **destaque**. ', 30)]]));
    }
    $t0 = hrtime(true);
    [, $b] = $service->read($aluno, 'hq', 'pt-BR', null);
    $sizes[$n] = [strlen((string) json_encode($b)), (hrtime(true) - $t0) / 1e6];
}
printf("   resposta: 1 aviso %d B, 10 avisos %d B, 50 avisos %d B (o limite da lista); leitura de 50 em %.1f ms\n", $sizes[1][0], $sizes[10][0], $sizes[50][0], $sizes[50][1]);
check($sizes[50][1] < 200, 'ler os 50 avisos do lugar (o limite) é rápido');

echo "\n== Os endpoints de verdade (php -S) ==\n";
$port = 18000 + random_int(0, 999);
$env = sprintf('SPIKE_MYSQL_HOST=%s SPIKE_MYSQL_PORT=%s SPIKE_MYSQL_DB=%s SPIKE_MYSQL_USER=%s SPIKE_MYSQL_PASS=%s', ...array_map(static fn ($k) => escapeshellarg((string) getenv($k)), ['SPIKE_MYSQL_HOST', 'SPIKE_MYSQL_PORT', 'SPIKE_MYSQL_DB', 'SPIKE_MYSQL_USER', 'SPIKE_MYSQL_PASS']));
$server = proc_open("{$env} exec " . escapeshellarg(PHP_BINARY) . " -S 127.0.0.1:{$port} -t " . escapeshellarg("{$root}/public"), [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100000);
}
$http = static function (string $method, string $path, ?array $json, string &$cookie, ?string $etag = null) use ($port): array {
    $ch = curl_init("http://127.0.0.1:{$port}/{$path}");
    $headers = ['Content-Type: application/json'];
    if ($cookie !== '') {
        $headers[] = "Cookie: {$cookie}";
    }
    if ($etag !== null) {
        $headers[] = "If-None-Match: {$etag}";
    }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers] + ($json !== null ? [CURLOPT_POSTFIELDS => json_encode($json)] : []));
    $raw = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $head = substr($raw, 0, $size);
    if (preg_match('/Set-Cookie: (spike_notices=[^;]+)/i', $head, $m)) {
        $cookie = $m[1];
    }
    preg_match('/ETag: (\S+)/i', $head, $e);
    return [$code, json_decode(substr($raw, $size), true), $e[1] ?? null, $head];
};
try {
    $pdo->exec('DELETE FROM spike_notices');
    $none = '';
    check($http('GET', 'notices.php?place=hq&lang=pt-BR', null, $none)[0] === 401, 'sem sessão, 401');
    $m = '';
    $st = '';
    $bo = '';
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'aurora', 'role' => 'master'], $m);
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'aurora', 'role' => 'student'], $st);
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 'boreal', 'role' => 'student'], $bo);
    [$c, $b] = $http('POST', 'notices.php', ['action' => 'create', 'tenant' => 'boreal'] + $aviso(), $m);
    check($c === 201, 'o master da Aurora publica pela sessão (o "tenant" no corpo não vale nada)');
    [$c, $b, $etag, $head] = $http('GET', 'notices.php?place=hq&lang=en-US', null, $st);
    check($c === 200 && ($b['data']['notices'][0]['title'] ?? '') === 'Exam on Friday' && stripos($head, 'Cache-Control: no-cache') !== false, 'o aluno da Aurora lê em inglês, com no-cache');
    check($http('GET', 'notices.php?place=hq&lang=en-US', null, $st, $etag)[0] === 304, 'com o mesmo ETag, 304');
    check($http('GET', 'notices.php?place=hq&lang=pt-BR', null, $bo)[1]['data']['notices'] === [] && $http('POST', 'notices.php', ['action' => 'create'] + $aviso(), $st)[0] === 403, 'a Boreal não vê nada, e o aluno não publica (403)');
} finally {
    proc_terminate($server);
}

echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
exit($failed ? 1 : 0);
