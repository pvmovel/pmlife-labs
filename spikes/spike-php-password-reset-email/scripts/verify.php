<?php
declare(strict_types=1);

// Prova o spike: regras puras (sempre); em cada banco configurado, os cenários do Gherkin da US39; e, com o servidor
// SMTP de teste (Mailpit), o envio de verdade, com e sem TLS.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
//   SPIKE_SMTP_HOST, SPIKE_SMTP_PORT, SPIKE_MAILPIT_API                 (Mailpit sem TLS, só no próprio computador)
//   SPIKE_SMTP_TLS_PORT, SPIKE_MAILPIT_TLS_API, SPIKE_SMTP_CAFILE       (Mailpit com TLS implícito e certificado de teste)
// ATENÇÃO: o script apaga as tabelas do spike no banco informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';

use Spike\Reset\Auth\MemoryThrottleStore;
use Spike\Reset\Auth\PasswordPolicy;
use Spike\Reset\Db\ConnectionFactory;
use Spike\Reset\Db\Migrator;
use Spike\Reset\Http\ResetApi;
use Spike\Reset\Http\Responder;
use Spike\Reset\Mail\MailFailed;
use Spike\Reset\Mail\MailMessage;
use Spike\Reset\Mail\MemoryMailer;
use Spike\Reset\Mail\ResetMail;
use Spike\Reset\Mail\SmtpMailer;
use Spike\Reset\Reset\PasswordResetService;
use Spike\Reset\Reset\PdoResetStore;
use Spike\Reset\Reset\ResetCode;
use Spike\Reset\Reset\ResetThrottle;
use Spike\Reset\Reset\SessionCredentials;

$root = dirname(__DIR__);
$failed = false;

function check(bool $ok, string $label): void
{
    global $failed;
    echo ($ok ? '✅ ' : '❌ ') . $label . "\n";
    if (!$ok) {
        $failed = true;
    }
}

$now = new DateTimeImmutable('2026-10-28T10:00:00Z');
$at = static fn (int $seconds): DateTimeImmutable => $now->modify("+{$seconds} seconds");
const OLD_PASS = 'correct horse battery staple';
const NEW_PASS = 'uma frase nova e comprida';
const CONFIG = ['RATE_SALT' => 'sal-de-teste', 'RESET_SECRET' => 'segredo-de-teste'];

/** O código que foi no e-mail (como o aluno lê). */
function code_from(string $text): string
{
    return preg_match('/(\d{4}) (\d{4})/', $text, $m) === 1 ? $m[1] . $m[2] : '';
}

// ---------------------------------------------------------------- regras puras (sem banco)
echo "--- código\n";
$codes = array_map(static fn (): string => ResetCode::generate(), range(1, 200));
check(array_filter($codes, static fn (string $c): bool => preg_match('/^\d{8}$/', $c) !== 1) === [], 'sempre 8 dígitos, com zeros à esquerda (random_int)');
check(count(array_unique($codes)) >= 199, '200 códigos seguidos sem repetição');
check(ResetCode::normalize('1234 5678') === '12345678' && ResetCode::normalize('1234-5678') === '12345678' && ResetCode::normalize(' 12.34.56.78 ') === '12345678', 'aceita o código com espaço, hífen ou ponto (como foi copiado do e-mail)');
check(ResetCode::normalize('1234567') === null && ResetCode::normalize('1234567a') === null && ResetCode::normalize('123456789') === null, 'recusa o que não tem exatamente 8 dígitos');
check(ResetCode::display('01234567') === '0123 4567', 'aparece no e-mail como "0123 4567"');
$h = ResetCode::hash('12345678', 1, 's');
check(strlen($h) === 64 && $h !== ResetCode::hash('12345678', 2, 's') && $h !== ResetCode::hash('12345678', 1, 'outro'), 'HMAC-SHA256 depende da conta e do segredo: o mesmo código de outra conta não confere');

echo "--- limites\n";
$t = new ResetThrottle(new MemoryThrottleStore(), 'sal');
$ok = array_map(static fn (): bool => $t->allowRequest('ana@escola.test', '10.0.0.1', $now), range(1, 3));
check($ok === [true, true, true] && !$t->allowRequest('ANA@escola.test', '10.0.0.2', $now), 'Gherkin: 3 pedidos por conta e o 4º é recusado (mesmo de outro IP, com o e-mail em maiúsculas)');
check($t->allowRequest('bia@escola.test', '10.0.0.1', $now), 'outra conta no mesmo IP continua pedindo');
check(!$t->allowRequest('ana@escola.test', '10.0.0.1', $at(ResetThrottle::REQUEST_WINDOW_SECONDS)), 'na hora seguinte ainda conta a anterior (sem o truque da virada de janela)');
check($t->allowRequest('ana@escola.test', '10.0.0.1', $at(2 * ResetThrottle::REQUEST_WINDOW_SECONDS)), 'duas horas depois, pode pedir de novo');
$t2 = new ResetThrottle(new MemoryThrottleStore(), 'sal');
$byIp = array_map(static fn (int $i): bool => $t2->allowRequest("aluno{$i}@escola.test", '10.0.0.9', $now), range(1, 11));
check(array_count_values(array_map('json_encode', $byIp)) === ['true' => 10, 'false' => 1], '10 pedidos por IP em 15 min (para muitas contas) e o 11º é recusado');
$t3 = new ResetThrottle(new MemoryThrottleStore(), 'sal');
for ($i = 0; $i < 19; $i++) {
    $t3->confirmFailed('10.0.0.5', $now);
}
$lockedAt19 = $t3->confirmLocked('10.0.0.5', $now);
$t3->confirmFailed('10.0.0.5', $now);
check(!$lockedAt19 && $t3->confirmLocked('10.0.0.5', $now) && !$t3->confirmLocked('10.0.0.6', $now), '20 trocas com código errado no mesmo IP bloqueiam aquele IP');
check(ResetThrottle::retryAfter(new DateTimeImmutable('@900'), 900) === 1800, 'Retry-After aponta o fim da janela seguinte');

echo "--- e-mail\n";
$pt = ResetMail::build('ana@escola.test', '1234 5678', 15, 'pt-BR');
$en = ResetMail::build('ana@escola.test', '1234 5678', 15, 'en-US');
check(str_contains($pt->text, '1234 5678') && str_contains($pt->text, '15 minutos') && $pt->subject === 'Seu código para criar uma senha nova', 'pt-BR: o código, a validade e o assunto vêm do arquivo de locale');
check(str_contains($en->text, '15 minutes') && $en->subject === 'Your code to set a new password', 'en-US: o mesmo e-mail em inglês');
check(ResetMail::build('ana@escola.test', '1234 5678', 15, 'xx-YY')->subject === $pt->subject && ResetMail::locale(null) === 'pt-BR', 'idioma desconhecido cai no pt-BR');
check(!str_contains($pt->text . $en->text, 'ana') && !preg_match('/instituiç|instituti/i', $pt->text . $en->text), 'o e-mail não traz o nome da conta nem as instituições');
$refused = 0;
foreach ([["ana@escola.test\r\nBcc: x@y.z", 'Assunto'], ['ana@escola.test', "Assunto\r\nBcc: x@y.z"], ['nao-e-email', 'Assunto']] as [$to, $subject]) {
    try {
        new MailMessage($to, $subject, 'texto');
    } catch (InvalidArgumentException) {
        $refused++;
    }
}
check($refused === 3, 'quebra de linha no destinatário ou no assunto (injeção de cabeçalho) e destinatário inválido são recusados');
try {
    new SmtpMailer('smtp.exemplo.test', 25, false, 'u', 'p', 'nao-responda@exemplo.test', 'PMLife');
    check(false, 'SMTP sem TLS fora do próprio computador é recusado');
} catch (MailFailed $e) {
    check($e->getMessage() === 'SMTP_TLS_REQUIRED', 'SMTP sem TLS fora do próprio computador é recusado (a senha nunca sai em claro)');
}
$payload = (new SmtpMailer('127.0.0.1', 1, false, 'u', 'p', 'nao-responda@exemplo.test', 'PMLife'))->payload($pt);
check(str_contains($payload, 'Subject: =?UTF-8?B?' . base64_encode($pt->subject) . '?=') && str_contains($payload, 'Content-Transfer-Encoding: base64') && str_contains($payload, 'Auto-Submitted: auto-generated'), 'assunto com acento em UTF-8 (RFC 2047), corpo em base64 e marcado como automático');
check(!preg_match('/^\./m', explode("\r\n\r\n", $payload, 2)[1]) && !str_contains($payload, "\n.\r\n"), 'corpo em base64: nenhuma linha começa com "." (o fim do DATA não é forjável)');

// ---------------------------------------------------------------- bancos
$targets = [];
foreach (['mysql' => 'MySQL', 'pgsql' => 'PostgreSQL'] as $driver => $label) {
    $prefix = 'SPIKE_' . strtoupper($driver) . '_';
    if (getenv($prefix . 'HOST') === false) {
        continue;
    }
    $targets[$label] = [
        'DB_DRIVER' => $driver,
        'DB_HOST' => getenv($prefix . 'HOST'),
        'DB_PORT' => (int) getenv($prefix . 'PORT'),
        'DB_NAME' => getenv($prefix . 'DB'),
        'DB_USER' => getenv($prefix . 'USER'),
        'DB_PASS' => (string) getenv($prefix . 'PASS'),
    ];
}
if ($targets === []) {
    if (getenv('CI') !== false) {
        echo "❌ Nenhum banco configurado no CI (SPIKE_MYSQL_* / SPIKE_PGSQL_*)\n";
        exit(1);
    }
    echo "⚠️  Nenhum banco configurado: defina SPIKE_MYSQL_* e/ou SPIKE_PGSQL_* (veja o README). Pulando a parte com banco.\n";
    exit($failed ? 1 : 0);
}

function reset_db(PDO $pdo): void
{
    foreach (['password_resets', 'auth_rate_limit', 'users', 'schema_migrations'] as $table) {
        $pdo->exec("DROP TABLE IF EXISTS {$table}");
    }
}

/** @return int id da conta */
function add_user(PDO $pdo, string $email, string $password, DateTimeImmutable $now): int
{
    $pdo->prepare('INSERT INTO users (email, password_hash, credentials_version, created_at) VALUES (?, ?, 1, ?)')
        ->execute([$email, PasswordPolicy::default()->hash($password), $now->format('Y-m-d H:i:s')]);
    return (int) $pdo->query("SELECT id FROM users WHERE email = '{$email}'")->fetchColumn();
}

function password_of(PDO $pdo, int $id): string
{
    return (string) $pdo->query("SELECT password_hash FROM users WHERE id = {$id}")->fetchColumn();
}

// Os spikes do labs dividem o mesmo banco de teste no CI: ao sair (mesmo com erro), as tabelas daqui são apagadas,
// para a chave estrangeira de password_resets não travar o spike seguinte.
register_shutdown_function(static function () use ($targets): void {
    foreach ($targets as $config) {
        try {
            reset_db(ConnectionFactory::create($config));
        } catch (Throwable) {
        }
    }
});

foreach ($targets as $label => $config) {
    echo "--- {$label}\n";
    $pdo = ConnectionFactory::create($config);
    reset_db($pdo);
    (new Migrator($pdo, $root . '/migrations'))->migrate();
    $ana = add_user($pdo, 'ana@aurora.test', OLD_PASS, $now);
    $mail = new MemoryMailer();
    $api = new ResetApi(spike_reset_service($pdo, $mail, CONFIG));
    $store = new PdoResetStore($pdo);
    $pw = PasswordPolicy::default();
    $request = static fn (string $email, string $ip = '10.1.0.1', ?DateTimeImmutable $when = null, string $locale = 'pt-BR'): array
        => $api->handle('request', ['email' => $email, 'locale' => $locale], $ip, $when ?? $now);
    $confirm = static fn (string $email, string $code, string $pass = NEW_PASS, ?string $again = null, string $ip = '10.1.0.1', ?DateTimeImmutable $when = null): array
        => $api->handle('confirm', ['email' => $email, 'code' => $code, 'password' => $pass, 'confirmation' => $again ?? $pass], $ip, $when ?? $now);

    // Gherkin: trocar a senha com o código recebido por e-mail
    $sessionBefore = ['uid' => $ana, 'cv' => $store->credentialsVersion($ana)];
    $r = $request('Ana@Aurora.test');
    check($r['status'] === 202 && $mail->sent === [], 'pedido aceito (202) e o e-mail ainda NÃO saiu: o envio fica para depois da resposta');
    ($r['after'])();
    $code = code_from($mail->sent[0]->text ?? '');
    check(count($mail->sent) === 1 && $mail->sent[0]->to === 'ana@aurora.test' && strlen($code) === 8, 'depois da resposta, sai um e-mail para a conta com o código de 8 dígitos');
    $row = $pdo->query("SELECT * FROM password_resets WHERE user_id = {$ana}")->fetch();
    check($row !== false && !str_contains(json_encode($row), $code) && hash_equals((string) $row['code_hash'], ResetCode::hash($code, $ana, CONFIG['RESET_SECRET'])), 'o banco guarda só o HMAC do código, nunca o código');
    $c = $confirm('ana@aurora.test', substr($code, 0, 4) . ' ' . substr($code, 4));
    check($c['status'] === 200 && $c['body'] === ['status' => 'ok', 'data' => ['changed' => true]], 'Gherkin: o código digitado na mesma tela, com a senha nova e a confirmação, troca a senha (200)');
    check($pw->verify(NEW_PASS, password_of($pdo, $ana)) && !$pw->verify(OLD_PASS, password_of($pdo, $ana)), 'a senha nova entra e a antiga deixa de valer');
    check(str_starts_with(password_of($pdo, $ana), defined('PASSWORD_ARGON2ID') ? '$argon2id$' : '$2y$'), 'a senha nova é gravada com Argon2id');
    check((int) $pdo->query("SELECT COUNT(*) FROM password_resets WHERE user_id = {$ana}")->fetchColumn() === 0, 'o código é apagado depois do uso');
    check($confirm('ana@aurora.test', $code, 'outra frase bem comprida')['body']['error']['code'] === 'RESET_CODE_INVALID', 'o mesmo código não serve uma segunda vez');

    // Gherkin: trocar a senha encerra as outras sessões
    $guard = new SessionCredentials($store);
    check(!$guard->stillValid($sessionBefore) && $guard->stillValid(['uid' => $ana, 'cv' => $store->credentialsVersion($ana)]), 'Gherkin: a sessão aberta antes da troca (outro aparelho) cai; um login novo vale');

    // Gherkin: não revelar quem tem conta
    $sentBefore = count($mail->sent);
    $ghost = $request('ninguem@aurora.test', '10.1.0.2');
    $real = $request('ana@aurora.test', '10.1.0.2');
    ($ghost['after'])();
    check($ghost['status'] === $real['status'] && $ghost['body'] === $real['body'] && $ghost['headers'] === $real['headers'], 'Gherkin: e-mail sem conta recebe a mesma resposta (status, corpo e cabeçalhos)');
    check(count($mail->sent) === $sentBefore, 'Gherkin: e nenhum e-mail é enviado');
    check($confirm('ninguem@aurora.test', '12345678')['body']['error']['code'] === 'RESET_CODE_INVALID', 'troca para e-mail sem conta dá o mesmo erro de código inválido');
    ($real['after'])();

    // Gherkin: código vencido, usado ou errado demais
    $bia = add_user($pdo, 'bia@aurora.test', OLD_PASS, $now);
    $first = $request('bia@aurora.test', '10.2.0.1');
    ($first['after'])();
    $oldCode = code_from(end($mail->sent)->text);
    $second = $request('bia@aurora.test', '10.2.0.1', $at(60));
    ($second['after'])();
    $newCode = code_from(end($mail->sent)->text);
    check($confirm('bia@aurora.test', $oldCode, NEW_PASS, null, '10.2.0.1', $at(61))['body']['error']['code'] === 'RESET_CODE_INVALID', 'pedir outro código invalida o anterior');
    check($confirm('bia@aurora.test', $newCode, NEW_PASS, null, '10.2.0.1', $at(60 + PasswordResetService::CODE_TTL_SECONDS + 1))['body']['error']['code'] === 'RESET_CODE_INVALID', 'Gherkin: código vencido (mais de 15 min) é recusado');
    check($pw->verify(OLD_PASS, password_of($pdo, $bia)), 'Gherkin: e a senha antiga continua valendo');

    $caio = add_user($pdo, 'caio@aurora.test', OLD_PASS, $now);
    $r = $request('caio@aurora.test', '10.3.0.1');
    ($r['after'])();
    $right = code_from(end($mail->sent)->text);
    $wrong = str_pad((string) (((int) $right + 1) % 100000000), 8, '0', STR_PAD_LEFT);
    $errors = array_map(static fn (): string => $confirm('caio@aurora.test', $wrong, NEW_PASS, null, '10.3.0.1')['body']['error']['code'], range(1, 5));
    check($errors === array_fill(0, 5, 'RESET_CODE_INVALID'), '5 códigos errados são recusados');
    check($confirm('caio@aurora.test', $right, NEW_PASS, null, '10.3.0.1')['body']['error']['code'] === 'RESET_CODE_INVALID' && $pw->verify(OLD_PASS, password_of($pdo, $caio)), 'Gherkin: depois de 5 erros, nem o código certo troca a senha');

    // Gherkin: confirmação diferente ou senha fraca, sem gastar o código
    $davi = add_user($pdo, 'davi@aurora.test', OLD_PASS, $now);
    $r = $request('davi@aurora.test', '10.4.0.1');
    ($r['after'])();
    $code = code_from(end($mail->sent)->text);
    check($confirm('davi@aurora.test', $code, NEW_PASS, 'outra coisa qualquer', '10.4.0.1')['body']['error']['code'] === 'PASSWORD_MISMATCH', 'Gherkin: confirmação diferente é recusada (PASSWORD_MISMATCH)');
    check($confirm('davi@aurora.test', $code, 'curta', null, '10.4.0.1')['body']['error']['code'] === 'PASSWORD_TOO_SHORT'
        && $confirm('davi@aurora.test', $code, 'password1234', null, '10.4.0.1')['body']['error']['code'] === 'PASSWORD_TOO_COMMON'
        && $confirm('davi@aurora.test', $code, 'davi@aurora.test', null, '10.4.0.1')['body']['error']['code'] === 'PASSWORD_TOO_COMMON', 'Gherkin: senha curta, comum ou igual ao e-mail é recusada (a política da US30)');
    check((int) $pdo->query("SELECT attempts FROM password_resets WHERE user_id = {$davi}")->fetchColumn() === 0, 'Gherkin: essas recusas não gastam tentativa do código');
    check($confirm('davi@aurora.test', $code, NEW_PASS, null, '10.4.0.1')['status'] === 200, 'e o mesmo código ainda troca a senha');

    // Uso único e limite de tentativas sob pedidos em paralelo (o que o SQL atômico garante)
    $eva = add_user($pdo, 'eva@aurora.test', OLD_PASS, $now);
    $store->saveCode($eva, ResetCode::hash('11112222', $eva, CONFIG['RESET_SECRET']), $at(900), $now);
    $pdo->exec("UPDATE password_resets SET attempts = 4 WHERE user_id = {$eva}");
    check($store->spendAttempt($eva, $now) !== null && $store->spendAttempt($eva, $now) === null, 'com 4 tentativas gastas, de dois pedidos ao mesmo tempo só um tenta (UPDATE ... WHERE attempts < 5)');
    $store->saveCode($eva, ResetCode::hash('11112222', $eva, CONFIG['RESET_SECRET']), $at(900), $now);
    $hash = $store->spendAttempt($eva, $now);
    check($store->consume($eva, (string) $hash, $pw->hash(NEW_PASS)) && !$store->consume($eva, (string) $hash, $pw->hash('outra senha comprida')), 'dois pedidos com o código certo ao mesmo tempo: só um troca a senha (DELETE ... WHERE code_hash)');
    check($pw->verify(NEW_PASS, password_of($pdo, $eva)), 'e vale a senha do pedido que ganhou');

    // Gherkin: pedidos em excesso
    $fabi = add_user($pdo, 'fabi@aurora.test', OLD_PASS, $now);
    $sentBefore = count($mail->sent);
    foreach (range(1, 3) as $i) {
        ($request('fabi@aurora.test', "10.5.0.{$i}")['after'])();
    }
    $fourth = $request('fabi@aurora.test', '10.5.0.9');
    ($fourth['after'])();
    check($fourth['status'] === 429 && $fourth['body']['error']['code'] === 'RATE_LIMITED' && (int) ($fourth['headers']['Retry-After'] ?? 0) > 0, 'Gherkin: o 4º pedido na mesma hora recebe 429 RATE_LIMITED com Retry-After');
    check(count($mail->sent) === $sentBefore + 3, 'Gherkin: e nenhum e-mail sai no 4º pedido');
    foreach (range(1, 3) as $i) {
        $request('fantasma@aurora.test', "10.6.0.{$i}");
    }
    check($request('fantasma@aurora.test', '10.6.0.9')['status'] === 429, 'e-mail sem conta também chega ao 429 no 4º pedido (o limite não revela quem tem conta)');
    foreach (range(1, 20) as $i) {
        $confirm('fabi@aurora.test', '00000000', NEW_PASS, null, '10.7.0.1');
    }
    check($confirm('fabi@aurora.test', '00000000', NEW_PASS, null, '10.7.0.1')['status'] === 429, '20 trocas erradas no mesmo IP: a próxima recebe 429');
    check($api->handle('request', ['email' => 'nao-e-email'], '10.8.0.1', $now)['body']['error']['code'] === 'INVALID_REQUEST'
        && $api->handle('confirm', ['email' => 'fabi@aurora.test', 'code' => 1], '10.8.0.1', $now)['body']['error']['code'] === 'INVALID_REQUEST', 'e-mail inválido ou campo faltando: 400 INVALID_REQUEST');

    // LGPD e limpeza
    $keys = $pdo->query('SELECT bucket_key FROM auth_rate_limit')->fetchAll(PDO::FETCH_COLUMN);
    check($keys !== [] && array_filter($keys, static fn (string $k): bool => preg_match('/^[0-9a-f]{64}$/', $k) !== 1) === [], 'a tabela de limites guarda só hashes: nenhum e-mail nem IP em claro');
    check($store->purgeExpired($at(3600)) >= 1 && (int) $pdo->query('SELECT COUNT(*) FROM password_resets')->fetchColumn() === 0, 'o Cron apaga os códigos vencidos');
}

// ---------------------------------------------------------------- SMTP de verdade (Mailpit)
$smtpHost = getenv('SPIKE_SMTP_HOST');
if ($smtpHost === false) {
    if (getenv('CI') !== false) {
        echo "❌ Servidor SMTP de teste não configurado no CI (SPIKE_SMTP_*)\n";
        exit(1);
    }
    echo "⚠️  Sem servidor SMTP de teste (SPIKE_SMTP_*): pulando o envio de verdade.\n";
    exit($failed ? 1 : 0);
}

/** @return list<array<string, mixed>> */
function mailpit(string $api, string $method = 'GET', string $path = '/api/v1/messages'): array
{
    $ctx = stream_context_create(['http' => ['method' => $method, 'timeout' => 5, 'ignore_errors' => true]]);
    $json = json_decode((string) @file_get_contents($api . $path, false, $ctx), true);
    return is_array($json) ? $json : [];
}

function mailpit_last(string $api): array
{
    for ($i = 0; $i < 20; $i++) {
        $id = mailpit($api)['messages'][0]['ID'] ?? null;
        if (is_string($id)) {
            return mailpit($api, 'GET', "/api/v1/message/{$id}");
        }
        usleep(100000);
    }
    return [];
}

echo "--- SMTP (Mailpit)\n";
$plainApi = (string) getenv('SPIKE_MAILPIT_API');
$tlsApi = (string) getenv('SPIKE_MAILPIT_TLS_API');
$from = 'nao-responda@exemplo.test';
$plain = new SmtpMailer($smtpHost, (int) getenv('SPIKE_SMTP_PORT'), false, 'spike', 'senha-de-teste', $from, 'PMLife');
$label = array_key_first($targets);
$pdo = ConnectionFactory::create($targets[$label]);
reset_db($pdo);
(new Migrator($pdo, $root . '/migrations'))->migrate();
$gabi = add_user($pdo, 'gabi@aurora.test', OLD_PASS, $now);
$api = new ResetApi(spike_reset_service($pdo, $plain, CONFIG));
mailpit($plainApi, 'DELETE');
$r = $api->handle('request', ['email' => 'gabi@aurora.test', 'locale' => 'pt-BR'], '10.9.0.1', $now);
($r['after'])();
$msg = mailpit_last($plainApi);
check(($msg['Subject'] ?? '') === 'Seu código para criar uma senha nova' && ($msg['To'][0]['Address'] ?? '') === 'gabi@aurora.test' && ($msg['From']['Name'] ?? '') === 'PMLife', "ponta a ponta ({$label}): o e-mail chega pelo SMTP com o assunto acentuado e o remetente certo");
$code = code_from((string) ($msg['Text'] ?? ''));
check($api->handle('confirm', ['email' => 'gabi@aurora.test', 'code' => $code, 'password' => NEW_PASS, 'confirmation' => NEW_PASS], '10.9.0.1', $now)['status'] === 200
    && PasswordPolicy::default()->verify(NEW_PASS, password_of($pdo, $gabi)), 'ponta a ponta: o código lido do e-mail recebido troca a senha');
mailpit($plainApi, 'DELETE');
$plain->send(ResetMail::build('gabi@aurora.test', '1234 5678', 15, 'en-US'));
check((mailpit_last($plainApi)['Subject'] ?? '') === 'Your code to set a new password', 'o e-mail sai no idioma pedido pela tela (en-US)');

$cafile = (string) getenv('SPIKE_SMTP_CAFILE');
$tlsPort = (int) getenv('SPIKE_SMTP_TLS_PORT');
mailpit($tlsApi, 'DELETE');
(new SmtpMailer($smtpHost, $tlsPort, true, 'spike', 'senha-de-teste', $from, 'PMLife', $cafile))->send($pt);
check((mailpit_last($tlsApi)['Subject'] ?? '') === $pt->subject, 'TLS implícito (como a porta 465), com o certificado do servidor verificado: o e-mail chega');
try {
    (new SmtpMailer($smtpHost, $tlsPort, true, 'spike', 'senha-de-teste', $from, 'PMLife'))->send($pt);
    check(false, 'certificado que não é de uma CA confiável é recusado');
} catch (MailFailed $e) {
    check($e->getMessage() === 'SMTP_CONNECT_FAILED', 'certificado que não é de uma CA confiável é recusado (nada de verify_peer desligado)');
}
try {
    (new SmtpMailer($smtpHost, (int) getenv('SPIKE_SMTP_PORT'), true, 'spike', 'senha-de-teste', $from, 'PMLife', $cafile))->send($pt);
    check(false, 'servidor sem TLS quando o TLS é exigido: o envio falha');
} catch (MailFailed $e) {
    check(true, 'servidor sem TLS quando o TLS é exigido: o envio falha antes do AUTH (' . $e->getMessage() . ')');
}

// Falha de envio: a resposta já saiu como 202 e o erro vai só para o log
$down = new SmtpMailer('127.0.0.1', 1, false, 'spike', 'senha-de-teste', $from, 'PMLife');
$hana = add_user($pdo, 'hana@aurora.test', OLD_PASS, $now);
$r = (new ResetApi(spike_reset_service($pdo, $down, CONFIG)))->handle('request', ['email' => 'hana@aurora.test', 'locale' => 'pt-BR'], '10.9.0.2', $now);
$log = tempnam(sys_get_temp_dir(), 'reset-log');
$previousLog = ini_set('error_log', $log);
Responder::after($r['after']);
ini_set('error_log', (string) $previousLog);
$logged = (string) file_get_contents($log);
unlink($log);
check($r['status'] === 202 && $r['body'] === ['status' => 'ok', 'data' => ['accepted' => true]], 'servidor de e-mail fora do ar: o aluno recebe o mesmo 202 (o envio só acontece depois da resposta)');
check(str_contains($logged, 'SMTP_CONNECT_FAILED') && !str_contains($logged, 'senha-de-teste') && !str_contains($logged, 'hana@'), 'e o log registra a falha sem a senha do SMTP nem o e-mail do aluno');
echo 'Fechamento da resposta antes do envio neste PHP (' . PHP_SAPI . '): ' . (Responder::finisher() ?? 'nenhum (no CLI é esperado; conferir no servidor)') . "\n";

exit($failed ? 1 : 0);
