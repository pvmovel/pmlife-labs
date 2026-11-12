<?php
declare(strict_types=1);

// Prova o spike da US45: medalhas declaradas no curso e o certificado verificável a custo zero.
// Sem banco: as regras (os mesmos casos de cases/ que o TypeScript roda), o código do certificado e o JSON do Open
// Badges 2.0. Com um MySQL (SPIKE_MYSQL_*): a emissão (uma por aluno e curso) e os endpoints pelo servidor embutido do
// PHP (o progresso só da sessão, o certificado só com o curso concluído, a página pública sem o e-mail e o Open Badges).
// ATENÇÃO: o script apaga e recria a tabela spike_certificates do banco informado. Use um MySQL de teste.

require_once dirname(__DIR__) . '/php/bootstrap.php';

use Spike\Badges\BadgeRules;
use Spike\Badges\CertificateCode;
use Spike\Badges\CertificateStore;
use Spike\Badges\OpenBadges;

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

echo "== As regras, sem banco (os casos de cases/, os mesmos do TypeScript) ==\n";
foreach (glob("{$root}/cases/*.json") ?: [] as $file) {
    $c = json_decode((string) file_get_contents($file), true);
    $ok = true;
    if (array_key_exists('problems', $c['expect'])) {
        $ok = $ok && BadgeRules::problems($c['badges'], $c['phases'], $c['attributes']) === $c['expect']['problems'];
    }
    if (array_key_exists('earned', $c['expect'])) {
        $ok = $ok && BadgeRules::earned($c['badges'], $c['phases'], $c['progress'] + ['attributes' => []]) === $c['expect']['earned'];
    }
    if (array_key_exists('completed', $c['expect'])) {
        $ok = $ok && BadgeRules::courseCompleted($c['phases'], $c['progress']) === $c['expect']['completed'];
    }
    check($ok, basename($file) . ': ' . $c['description']);
}

$codes = [];
for ($i = 0; $i < 2000; $i++) {
    $codes[CertificateCode::generate()] = true;
}
$one = array_key_first($codes);
check(count($codes) === 2000 && preg_match('/^[0-9A-HJKMNP-TV-Z]{20}$/', $one) === 1, 'o código: 20 caracteres de Crockford (sem I, L, O e U), 100 bits aleatórios, sem repetir em 2.000');
check(CertificateCode::normalize(strtolower(CertificateCode::pretty($one))) === $one && CertificateCode::normalize('abc') === null && CertificateCode::normalize("{$one}' OR 1=1") === null, 'o código digitado em minúsculas e com hífens é aceito; o resto, recusado');

$cert = ['code' => $one, 'tenant_id' => 1, 'course_id' => 'dev-to-pm', 'salt' => str_repeat('a', 32), 'identity_hash' => hash('sha256', 'ana@exemplo.test' . str_repeat('a', 32)), 'issued_at' => '2026-11-11 10:00:00'];
$assertion = OpenBadges::assertion($cert, 'https://labs.exemplo');
$json = (string) json_encode($assertion, JSON_UNESCAPED_SLASHES);
check($assertion['@context'] === 'https://w3id.org/openbadges/v2' && $assertion['type'] === 'Assertion' && $assertion['verification'] === ['type' => 'hosted'] && $assertion['issuedOn'] === '2026-11-11T10:00:00Z' && str_starts_with($assertion['badge'], 'https://labs.exemplo/ob.php?type=badge'), 'Open Badges 2.0: a Assertion com o contexto, a verificação "hosted", a data ISO e o link da BadgeClass');
check($assertion['recipient']['hashed'] === true && str_starts_with($assertion['recipient']['identity'], 'sha256$') && !str_contains($json, '@exemplo.test'), 'quem recebeu vai só como hash do e-mail com sal: o e-mail não aparece no JSON');
$badge = OpenBadges::badgeClass(1, 'dev-to-pm', 'Dev a PM', 'https://labs.exemplo');
check($badge['type'] === 'BadgeClass' && isset($badge['name'], $badge['description'], $badge['image'], $badge['criteria']['narrative']) && $badge['issuer'] === 'https://labs.exemplo/ob.php?type=issuer&tenant=1' && OpenBadges::issuer(1, 'Escola', 'https://labs.exemplo')['type'] === 'Profile', 'a BadgeClass tem os campos obrigatórios (nome, descrição, imagem, critério e emissor), e o emissor é o Profile da instituição');

$host = getenv('SPIKE_MYSQL_HOST');
if (!$host) {
    echo "\n⚠️  Sem SPIKE_MYSQL_*: só as regras foram testadas.\n";
    echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
    exit($failed ? 1 : 0);
}

$pdo = badges_pdo();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
echo "\n== A emissão, no MySQL {$version} ==\n";
$pdo->exec('DROP TABLE IF EXISTS spike_certificates');
$pdo->exec((string) preg_replace('/^--.*$/m', '', (string) file_get_contents("{$root}/migrations/mysql/001_create_spike_certificates.sql")));
$store = new CertificateStore($pdo);
$who = ['studentName' => 'Ana Lima', 'courseTitle' => 'Dev a PM', 'institutionName' => 'Escola Aurora', 'email' => 'ana@exemplo.test'];
$a = $store->issue(1, 7, 'dev-to-pm', $who, '2026-11-11');
$again = $store->issue(1, 7, 'dev-to-pm', ['studentName' => 'Outro nome'] + $who, '2026-12-01');
check($a['code'] === $again['code'] && $again['student_name'] === 'Ana Lima' && (int) $pdo->query('SELECT COUNT(*) FROM spike_certificates')->fetchColumn() === 1, 'um certificado por aluno e curso: pedir de novo devolve o mesmo, com a foto do momento da emissão');
$b = $store->issue(2, 7, 'dev-to-pm', $who, '2026-11-11');
check($b['code'] !== $a['code'] && $store->byCode($a['code'])['tenant_id'] == 1 && $store->byCode('ZZZZZZZZZZZZZZZZZZZZ') === null, 'outra instituição, outro certificado; o código acha só o dele');
check(hash('sha256', 'ana@exemplo.test' . $a['salt']) === $a['identity_hash'] && !in_array('ana@exemplo.test', $a, true), 'o banco guarda o hash do e-mail com sal, nunca o e-mail');

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
    if (preg_match('/Set-Cookie: (spike_badges=[^;]+)/i', $head, $m)) {
        $cookie = $m[1];
    }
    $body = substr($raw, $size);
    return [$code, json_decode($body, true), $head, $body];
};
try {
    $none = '';
    check($http('GET', 'course.php', null, $none)[0] === 401, 'sem sessão, 401');
    $ana = '';
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 1, 'name' => 'Ana Lima'], $ana);
    [$c, $state] = $http('GET', 'course.php', null, $ana);
    check($c === 200 && $state['data']['earned'] === [] && $state['data']['completed'] === false && $state['data']['certificate'] === null, 'a aluna entra sem medalha, sem o curso concluído e sem certificado');
    check($http('POST', 'course.php', ['action' => 'issue', 'phases' => ['fase-1', 'fase-2', 'fase-3']], $ana)[1]['error']['code'] === 'COURSE_NOT_COMPLETED', 'o certificado só sai com o curso concluído (409); fases mandadas no pedido não valem');
    [, $s1] = $http('POST', 'course.php', ['action' => 'phase', 'phase' => 'fase-1'], $ana);
    check($s1['data']['earned'] === ['primeira-fase'], 'Gherkin "Medalha por fase": concluída a fase 1, a medalha "Primeira fase" aparece');
    [, $s2] = $http('POST', 'course.php', ['action' => 'points', 'attribute' => 'comunicacao', 'points' => 30], $ana);
    check($s2['data']['earned'] === ['primeira-fase', 'comunicador'], 'com 30 pontos de Comunicação, a medalha do atributo');
    $http('POST', 'course.php', ['action' => 'phase', 'phase' => 'fase-2'], $ana);
    $http('POST', 'course.php', ['action' => 'phase', 'phase' => 'fase-3'], $ana);
    [$c, $issued] = $http('POST', 'course.php', ['action' => 'issue'], $ana);
    $certInfo = $issued['data']['certificate'] ?? [];
    check($c === 201 && $issued['data']['completed'] === true && in_array('formado', $issued['data']['earned'], true) && preg_match('/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/', (string) ($certInfo['code'] ?? '')) === 1, 'todas as fases concluídas: a medalha de curso e o certificado, com o código em grupos de 5');
    $code = str_replace('-', '', (string) $certInfo['code']);
    [$c, , $head, $html] = $http('GET', "verify.php?code={$code}", null, $none);
    check($c === 200 && str_contains($html, 'Ana Lima') && str_contains($html, 'Dev a PM') && str_contains($html, 'Escola Aurora') && str_contains($html, gmdate('d/m/Y')) && str_contains($html, 'Certificado verificado'), 'Gherkin "Certificado verificável": a página pública mostra o nome, o curso, a instituição e a data');
    check(!str_contains($html, '@exemplo.test') && !str_contains($html, 'comunicacao') && stripos($head, 'X-Robots-Tag: noindex') !== false && str_contains($html, 'name="robots" content="noindex"'), 'sem o e-mail nem os pontos, e fora dos buscadores (noindex)');
    [$c, , , $nf] = $http('GET', 'verify.php?code=ZZZZZZZZZZZZZZZZZZZZ', null, $none);
    check($c === 404 && str_contains($nf, 'não encontrado') && $http('GET', 'verify.php?code=%3Cscript%3E', null, $none)[0] === 404, 'um código que não existe (ou fora do formato): 404, sem erro');
    [$c, $ob, $obHead] = $http('GET', "ob.php?type=assertion&code={$code}", null, $none);
    $badgeUrl = (string) ($ob['badge'] ?? '');
    [$cb, $badgeJson] = $http('GET', substr($badgeUrl, strpos($badgeUrl, 'ob.php')), null, $none);
    [$ci, $issuer] = $http('GET', substr((string) ($badgeJson['issuer'] ?? ''), strpos((string) ($badgeJson['issuer'] ?? 'ob.php'), 'ob.php')), null, $none);
    check($c === 200 && stripos($obHead, 'application/ld+json') !== false && ($ob['type'] ?? '') === 'Assertion' && $cb === 200 && ($badgeJson['type'] ?? '') === 'BadgeClass' && $ci === 200 && ($issuer['type'] ?? '') === 'Profile' && ($issuer['name'] ?? '') === 'Escola Aurora (fictícia)', 'Open Badges 2.0 "hosted": a Assertion leva à BadgeClass, que leva ao Profile da instituição, todos respondendo');
    $again = $http('POST', 'course.php', ['action' => 'issue'], $ana)[1]['data']['certificate']['code'] ?? '';
    check($again === $certInfo['code'], 'pedir de novo devolve o mesmo certificado');
    $bia = '';
    $http('POST', 'session.php', ['action' => 'join', 'tenant' => 1, 'name' => 'Bia'], $bia);
    check($http('GET', 'course.php', null, $bia)[1]['data']['certificate'] === null && $http('POST', 'session.php', ['action' => 'join', 'tenant' => 1, 'name' => '<script>'], $bia)[0] === 400, 'outra pessoa não vê o certificado da Ana pela própria sessão; um nome com HTML é recusado');
} finally {
    proc_terminate($server);
}

echo "\n" . ($failed ? "❌ falhou ({$total} verificações)" : "✅ {$total} verificações verdes") . "\n";
exit($failed ? 1 : 0);
