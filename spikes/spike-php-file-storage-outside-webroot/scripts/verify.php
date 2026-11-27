<?php
declare(strict_types=1);

// Prova o spike: as regras puras e o disco (sempre); o Range de verdade num php -S; e, em cada banco configurado,
// os cenários do Gherkin da US62 e os envios em paralelo contra a cota.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// ATENÇÃO: o script apaga as tabelas do spike no banco informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';

use Spike\Files\Db\ConnectionFactory;
use Spike\Files\Db\Migrator;
use Spike\Files\Http\ByteRange;
use Spike\Files\Http\FileSender;
use Spike\Files\Http\FilesApi;
use Spike\Files\Storage\FileLimits;
use Spike\Files\Storage\FileName;
use Spike\Files\Storage\FileRejected;
use Spike\Files\Storage\FileRepository;
use Spike\Files\Storage\FileService;
use Spike\Files\Storage\FileSniffer;
use Spike\Files\Storage\LocalDiskStorage;
use Spike\Files\Storage\MemoryFileRepository;
use Spike\Files\Storage\MemoryQuotaStore;
use Spike\Files\Storage\PdoFileRepository;
use Spike\Files\Storage\PdoQuotaStore;
use Spike\Files\Storage\QuotaStore;
use Spike\Files\Storage\StoredFile;
use Spike\Files\Storage\Viewer;

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

/** Pasta temporária própria, apagada no fim (nada fica no disco de quem roda). */
function temp_dir(string $name): string
{
    $dir = sys_get_temp_dir() . '/spike-files-' . $name . '-' . bin2hex(random_bytes(4));
    mkdir($dir, 0700, true);
    register_shutdown_function(static function () use ($dir): void {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    });
    return $dir;
}

/** @return resource um "upload" em memória com o conteúdo dado */
function source(string $bytes)
{
    $s = fopen('php://temp', 'w+b');
    fwrite($s, $bytes);
    rewind($s);
    return $s;
}

/** Tenta e devolve o código da recusa (ou 'OK'). */
function attempt(callable $fn): string
{
    try {
        $fn();
        return 'OK';
    } catch (FileRejected $e) {
        return $e->errorCode . ' ' . $e->status;
    }
}

$samples = [
    'application/pdf' => (string) file_get_contents("{$root}/samples/exemplo.pdf"),
    'image/png' => (string) file_get_contents("{$root}/samples/exemplo.png"),
    'image/jpeg' => "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00" . str_repeat("\x00", 40),
    'image/gif' => 'GIF89a' . str_repeat("\x01", 40),
    'image/webp' => 'RIFF' . pack('V', 100) . 'WEBPVP8 ' . str_repeat("\x00", 40),
    'audio/mpeg' => 'ID3' . "\x04\x00\x00" . str_repeat("\x00", 40),
    'audio/mp4' => pack('N', 24) . 'ftypM4A ' . "\x00\x00\x02\x00" . 'M4A isom' . str_repeat("\x00", 40),
    'audio/ogg' => 'OggS' . "\x00\x02" . str_repeat("\x00", 22) . "\x01\x1E\x01vorbis" . str_repeat("\x00", 20),
];

// ---------------------------------------------------------------- tipo pelo conteúdo
echo "--- tipo pelo conteúdo (a assinatura, nunca a extensão)\n";
$all = true;
foreach ($samples as $mime => $bytes) {
    $all = $all && FileSniffer::detect(substr($bytes, 0, FileSniffer::HEAD_BYTES)) === $mime;
}
check($all, 'os 8 tipos permitidos são reconhecidos pela assinatura: PDF, JPEG, PNG, GIF, WebP, MP3, M4A e OGG');
$mp3Frame = "\xFF\xFB\x90\x64" . str_repeat("\x00", 40); // MPEG-1 Layer III, 128 kbps, 44,1 kHz
check(FileSniffer::detect($mp3Frame) === 'audio/mpeg', 'MP3 sem etiqueta ID3, começando direto no quadro de áudio');
$fakes = [
    'executável do Windows com nome .pdf (MZ)' => "MZ\x90\x00\x03" . str_repeat("\x00", 40),
    'executável do Linux (ELF)' => "\x7FELF\x02\x01\x01" . str_repeat("\x00", 40),
    'SVG com script' => '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    'HTML disfarçado de imagem' => '<!doctype html><html><script>fetch("/api/me.php")</script>',
    'script PHP' => "<?php system(\$_GET['c']);",
    'ZIP (e todo .docx, .xlsx ou .apk)' => "PK\x03\x04" . str_repeat("\x00", 40),
    'vídeo MP4 (marca isom, sem M4A)' => pack('N', 24) . 'ftypisom' . "\x00\x00\x02\x00" . 'isomiso2' . str_repeat("\x00", 40),
    'Ogg com vídeo Theora' => 'OggS' . "\x00\x02" . str_repeat("\x00", 22) . "\x80theora" . str_repeat("\x00", 20),
    'AAC em ADTS (Layer 00)' => "\xFF\xF1\x50\x80" . str_repeat("\x00", 40),
    'PDF com lixo antes da assinatura' => "\n\n%PDF-1.4" . str_repeat("\x00", 40),
    'arquivo vazio' => '',
];
$rejected = array_filter($fakes, static fn (string $b): bool => FileSniffer::detect(substr($b, 0, FileSniffer::HEAD_BYTES)) !== null);
check($rejected === [], 'recusados pelo conteúdo: ' . implode(', ', array_keys($fakes)) . ($rejected === [] ? '' : ' (passou: ' . implode(', ', array_keys($rejected)) . ')'));
check(FileSniffer::detect('GIF89a<?php system($_GET["c"]); ?>') === 'image/gif', 'um GIF com PHP escondido passa como GIF, e por isso as outras barreiras: fora do webroot, sem extensão, nosniff e CSP sandbox (abaixo)');

// ---------------------------------------------------------------- nomes
echo "--- ids e nomes (nada do pedido vira caminho)\n";
$ids = array_map(static fn (): string => FileName::newId(), range(1, 200));
check(count(array_unique($ids)) === 200 && array_filter($ids, static fn (string $i): bool => !FileName::isId($i)) === [], 'ids de 32 hex (random_bytes), 200 seguidos sem repetição');
check(!FileName::isId('../../etc/passwd') && !FileName::isId(str_repeat('A', 32)) && !FileName::isId(str_repeat('a', 31) . "\0") && !FileName::isId(str_repeat('a', 33)), 'id fora do formato (traversal, maiúsculas, byte nulo, tamanho) é recusado');
check(FileName::clean('../../etc/passwd') === 'passwd' && FileName::clean('C:\\Users\\x\\aula 1.pdf') === 'aula 1.pdf' && FileName::clean("a\0b\r\n<c>.pdf") === 'abc.pdf', 'o nome original perde caminho, byte nulo, quebras de linha e caracteres de cabeçalho');
check(FileName::clean('...') === 'arquivo' && mb_strlen(FileName::clean(str_repeat('á', 300) . '.pdf')) === 120 && FileName::clean('Aula 3 — introdução.pdf') === 'Aula 3 — introdução.pdf', 'nome vazio vira "arquivo", nome longo é cortado em 120 caracteres, acentos ficam');

// ---------------------------------------------------------------- Range
echo "--- Range (RFC 9110)\n";
$r = static fn (?string $h, int $size = 1000): string => json_encode(ByteRange::parse($h, $size));
check($r('bytes=0-99') === '[0,99]' && $r('bytes=900-') === '[900,999]' && $r('bytes=-100') === '[900,999]', 'a-b, a- e -n (o começo, o resto e os últimos bytes)');
check($r('bytes=990-5000') === '[990,999]' && $r('bytes=-5000') === '[0,999]', 'o fim além do arquivo vira o último byte; -n maior que o arquivo é o arquivo inteiro');
check($r('bytes=1000-') === '"unsatisfiable"' && $r('bytes=-0') === '"unsatisfiable"' && $r('bytes=99999999999999999999-') === '"unsatisfiable"', 'começo depois do fim, -0 e número gigante: 416');
check($r(null) === '"full"' && $r('bytes=0-1,5-9') === '"full"' && $r('items=0-9') === '"full"' && $r('bytes=9-1') === '"full"' && $r('bytes=-') === '"full"' && $r('bytes=abc') === '"full"', 'sem cabeçalho, vários trechos, outra unidade ou sintaxe inválida: o arquivo inteiro (200)');
$pdf = new StoredFile(FileName::newId(), 1, 7, FileName::newId(), 'application/pdf', 1000, str_repeat('0', 64), 'Aula 1 — introdução.pdf', 1, '2026-11-27 10:00:00');
$png = new StoredFile(FileName::newId(), 1, 7, FileName::newId(), 'image/png', 1000, str_repeat('0', 64), 'foto.png', 1, '2026-11-27 10:00:00');
$p = FileSender::plan($pdf, 'bytes=0-99');
check($p['status'] === 206 && $p['headers']['Content-Range'] === 'bytes 0-99/1000' && $p['headers']['Content-Length'] === '100' && $p['start'] === 0 && $p['length'] === 100, '206 com Content-Range e Content-Length do trecho');
$p416 = FileSender::plan($pdf, 'bytes=5000-');
check($p416['status'] === 416 && $p416['headers']['Content-Range'] === 'bytes */1000', '416 com Content-Range "bytes */tamanho"');
$full = FileSender::plan($pdf, null);
check($full['status'] === 200 && $full['headers']['Accept-Ranges'] === 'bytes' && $full['headers']['Content-Length'] === '1000', '200 com Accept-Ranges: bytes (o <audio> sabe que pode pular)');
check($full['headers']['X-Content-Type-Options'] === 'nosniff' && $full['headers']['Cache-Control'] === 'private, no-store' && $full['headers']['Content-Type'] === 'application/pdf', 'nosniff, private no-store e o tipo conferido no envio');
check(!isset($full['headers']['Content-Security-Policy']) && FileSender::plan($png, null)['headers']['Content-Security-Policy'] === "default-src 'none'; sandbox", 'imagem e áudio com CSP sandbox; o PDF sem (o leitor do navegador não abre dentro do sandbox)');
check($full['headers']['Content-Disposition'] === "inline; filename=\"Aula 1 _ introdu__o.pdf\"; filename*=UTF-8''Aula%201%20%E2%80%94%20introdu%C3%A7%C3%A3o.pdf", 'Content-Disposition inline com o nome em ASCII e em UTF-8 (RFC 6266)');

// ---------------------------------------------------------------- disco
echo "--- disco fora do webroot\n";
$site = temp_dir('site');
mkdir("{$site}/public_html");
try {
    new LocalDiskStorage("{$site}/public_html/uploads", "{$site}/public_html");
    check(false, 'raiz dentro do webroot é recusada');
} catch (RuntimeException $e) {
    check($e->getMessage() === 'STORAGE_ROOT_INSIDE_WEBROOT', 'raiz dentro do webroot é recusada (STORAGE_ROOT_INSIDE_WEBROOT): nenhum arquivo enviado tem URL');
}
$disk = new LocalDiskStorage("{$site}/pmlife-files", "{$site}/public_html");
$key = $disk->put(3, source($samples['application/pdf']), FileLimits::MAX_FILE_BYTES);
$path = (string) $disk->path(3, $key);
check(FileName::isId($key) && $path === realpath($site) . "/pmlife-files/t3/{$key}" && is_file($path), 'grava em <raiz>/t<instituição>/<chave de 32 hex>, sem extensão (nada que o Apache execute)');
check((fileperms($path) & 0777) === 0640 && (fileperms(dirname($path)) & 0777) === 0750, 'permissões 640 no arquivo e 750 na pasta');
check(glob(dirname($path) . '/.up-*') === [], 'nenhum temporário fica para trás (gravação em .up-* e rename)');
$h = $disk->open(3, $key);
check(is_resource($h) && stream_get_contents($h) === $samples['application/pdf'], 'lê o mesmo conteúdo de volta');
check($disk->open(4, $key) === null, 'a mesma chave na pasta de outra instituição não existe');
$escapes = ['../t3/' . $key, '..', '%2e%2e%2f' . $key, $key . "\0", strtoupper($key), '/etc/passwd'];
check(array_filter($escapes, static fn (string $k): bool => $disk->open(3, $k) !== null) === [] && $disk->path(0, $key) === null && $disk->path(-1, $key) === null, 'chave com ../, %2e%2e, byte nulo, maiúsculas ou caminho absoluto, e instituição 0 ou negativa: nada é aberto');
try {
    $disk->put(3, source(str_repeat('x', 2000)), 1000);
    check(false, 'conteúdo maior que o limite é recusado mesmo com o tamanho declarado mentindo');
} catch (FileRejected $e) {
    check($e->errorCode === 'FILE_TOO_LARGE' && count(glob(dirname($path) . '/*')) === 1 && glob(dirname($path) . '/.up-*') === [], 'o disco para de ler no limite + 1 byte (FILE_TOO_LARGE) e apaga o que já tinha gravado');
}
$disk->delete(3, $key);
check(!is_file($path), 'apagar remove o arquivo');

// ---------------------------------------------------------------- serviço (as regras, em memória)
/**
 * Os cenários do Gherkin e as regras do serviço, iguais com os stores em memória e com os do banco.
 *
 * @param FileRepository&object{failNextInsert: bool} $repo
 */
function service_scenarios(string $label, FileRepository $repo, QuotaStore $quota, string $root, array $samples): void
{
    echo "--- serviço ({$label})\n";
    $storeRoot = temp_dir('store');
    $disk = new LocalDiskStorage($storeRoot);
    $clock = static fn (): DateTimeImmutable => new DateTimeImmutable('2026-11-27 10:00:00');
    $service = new FileService($disk, $repo, $quota, new FileLimits(2000), $clock);
    $quota->setQuota(1, 5000);
    $quota->setQuota(2, 5000);
    $authorA = new Viewer(1, 10, true);
    $studentA = new Viewer(1, 11, false, [7]);
    $otherCourseA = new Viewer(1, 12, false, [8]);
    $studentB = new Viewer(2, 20, false, [7]);
    $authorB = new Viewer(2, 21, true);

    $pdfBytes = str_pad('%PDF-1.4 material ficticio', 1000, "\n");
    $file = $service->upload($authorA, 7, source($pdfBytes), '../../Aula 1.pdf');
    check($file->mime === 'application/pdf' && $file->size === 1000 && $file->originalName === 'Aula 1.pdf' && $file->sha256 === hash('sha256', $pdfBytes) && $quota->usage(1)['used'] === 1000, 'o autor envia o PDF: tipo conferido, nome limpo, SHA-256 e 1000 bytes na cota');
    $exe = "MZ\x90\x00" . str_repeat("\x00", 200);
    check(attempt(fn () => $service->upload($authorA, 7, source($exe), 'aula.pdf')) === 'TYPE_NOT_ALLOWED 415' && $quota->usage(1)['used'] === 1000, 'Gherkin: um .pdf que é um executável é recusado pelo conteúdo (415), sem gastar cota');
    check(attempt(fn () => $service->upload($studentA, 7, source($pdfBytes), 'x.pdf')) === 'FORBIDDEN 403', 'o aluno não envia (403)');
    check(attempt(fn () => $service->upload($authorA, 7, source(''), 'x.pdf')) === 'EMPTY_FILE 422' && attempt(fn () => $service->upload($authorA, 7, source(str_pad('%PDF-', 2001, 'x')), 'x.pdf')) === 'FILE_TOO_LARGE 413', 'vazio (422) e acima do limite do arquivo (413)');

    $opened = $service->open($studentA, $file->id);
    check(stream_get_contents($opened['stream']) === $pdfBytes, 'o aluno matriculado no curso abre o PDF');
    check(attempt(fn () => $service->open($studentB, $file->id)) === 'NOT_FOUND 404' && attempt(fn () => $service->open($authorB, $file->id)) === 'NOT_FOUND 404', 'Gherkin: o aluno (e até o admin) da instituição B pede o PDF da A e recebe 404');
    check(attempt(fn () => $service->open($otherCourseA, $file->id)) === 'NOT_FOUND 404' && $service->list($otherCourseA, 7) === [], 'o aluno da mesma instituição sem matrícula no curso recebe 404 e uma lista vazia');
    check(attempt(fn () => $service->open($studentA, '../../etc/passwd')) === 'NOT_FOUND 404' && attempt(fn () => $service->open($studentA, FileName::newId())) === 'NOT_FOUND 404', 'id com traversal ou que nunca existiu: o mesmo 404');

    $service->upload($authorA, 7, source(str_pad('%PDF-1.4 b', 2000, ' ')), 'b.pdf');
    $service->upload($authorA, 7, source(str_pad('%PDF-1.4 c', 2000, ' ')), 'c.pdf');
    check($quota->usage(1)['used'] === 5000, 'a cota enche exatamente no teto (5000 de 5000)');
    $code = attempt(fn () => $service->upload($authorA, 7, source(str_pad('%PDF-1.4 d', 10, ' ')), 'd.pdf'));
    try {
        $service->upload($authorA, 7, source(str_pad('%PDF-1.4 d', 10, ' ')), 'd.pdf');
        $details = [];
    } catch (FileRejected $e) {
        $details = $e->details;
    }
    check($code === 'QUOTA_EXCEEDED 413' && $details === ['usedBytes' => 5000, 'quotaBytes' => 5000], 'Gherkin: com a cota cheia, mais um arquivo é recusado (413 QUOTA_EXCEEDED, com o uso e o teto para o aviso)');
    check($quota->usage(2)['used'] === 0 && $service->upload($authorB, 7, source($pdfBytes), 'b.pdf')->tenantId === 2, 'a cota é de cada instituição: a B continua enviando');

    $service->delete($authorA, $file->id);
    check($quota->usage(1)['used'] === 4000 && attempt(fn () => $service->open($studentA, $file->id)) === 'NOT_FOUND 404' && glob("{$storeRoot}/t1/*") !== false && count(glob("{$storeRoot}/t1/*")) === 2, 'apagar libera a cota, tira o registro e o arquivo do disco');
    check(attempt(fn () => $service->delete($authorA, $file->id)) === 'NOT_FOUND 404' && $quota->usage(1)['used'] === 4000, 'apagar de novo: 404, e a cota não é devolvida duas vezes');
    $other = $service->list($authorB, 7)[0];
    check(attempt(fn () => $service->delete($authorA, $other->id)) === 'NOT_FOUND 404' && attempt(fn () => $service->delete($studentA, $service->list($authorA, 7)[0]->id)) === 'FORBIDDEN 403', 'o admin da A não apaga o arquivo da B (404) e o aluno não apaga (403)');

    $repo->failNextInsert = true;
    $before = count(glob("{$storeRoot}/t1/*"));
    check(attempt(fn () => $service->upload($authorA, 7, source(str_pad('%PDF-1.4 e', 500, ' ')), 'e.pdf')) === 'STORAGE_FAILED 500' && count(glob("{$storeRoot}/t1/*")) === $before && $quota->usage(1)['used'] === 4000, 'o registro falha depois de gravar: o arquivo é apagado e a reserva volta (nada órfão, cota certa)');

    $orphan = $service->list($authorA, 7)[0];
    unlink("{$storeRoot}/t1/{$orphan->storageKey}");
    $log = tempnam(sys_get_temp_dir(), 'files-log');
    $previous = ini_set('error_log', $log);
    $code = attempt(fn () => $service->open($studentA, $orphan->id));
    ini_set('error_log', (string) $previous);
    $logged = (string) file_get_contents($log);
    unlink($log);
    check($code === 'NOT_FOUND 404' && str_contains($logged, $orphan->id) && !str_contains($logged, $storeRoot), 'o registro sem arquivo no disco responde 404 e vai para o log (com o id, sem o caminho)');

    $api = new FilesApi($service, static fn (string $p): bool => str_starts_with($p, sys_get_temp_dir()));
    $tmp = tempnam(sys_get_temp_dir(), 'upl');
    file_put_contents($tmp, str_pad('%PDF-1.4 api', 300, ' '));
    $upload = ['name' => 'api.pdf', 'tmp_name' => $tmp, 'size' => 300, 'error' => UPLOAD_ERR_OK];
    check($api->handle('upload', 'POST', null, [], $upload)['status'] === 401, 'API sem sessão: 401 UNAUTHENTICATED');
    check($api->handle('upload', 'POST', $authorA, ['courseId' => 7], $upload, 'errado', 'certo')['body']['error']['code'] === 'CSRF_INVALID'
        && $api->handle('upload', 'POST', $authorA, ['courseId' => 7], $upload, '', '')['status'] === 403, 'API: envio sem o CSRF da sessão ou com outro: 403 CSRF_INVALID');
    check($api->handle('upload', 'GET', $authorA, [], $upload)['status'] === 405 && $api->handle('outra', 'GET', $authorA, [])['status'] === 404, 'API: método errado 405, rota desconhecida 404');
    check($api->handle('upload', 'POST', $authorA, ['courseId' => 7], ['error' => UPLOAD_ERR_INI_SIZE], 'k', 'k')['body']['error']['code'] === 'FILE_TOO_LARGE'
        && $api->handle('upload', 'POST', $authorA, ['courseId' => 7], ['name' => 'x', 'tmp_name' => '/etc/passwd', 'error' => 0], 'k', 'k')['body']['error']['code'] === 'UPLOAD_FAILED', 'API: acima do upload_max_filesize do PHP é 413 FILE_TOO_LARGE; um tmp_name que não veio do upload é recusado');
    $ok = $api->handle('upload', 'POST', $authorA, ['courseId' => 7], $upload, 'k', 'k');
    check($ok['status'] === 201 && $ok['body']['data']['file']['name'] === 'api.pdf' && !isset($ok['body']['data']['file']['storageKey']) && $ok['body']['data']['usage'] === ['usedBytes' => 4300, 'quotaBytes' => 5000], 'API: 201 com o arquivo (sem a chave do disco) e o uso da cota');
    $listed = $api->handle('list', 'GET', $studentA, ['courseId' => 7]);
    check(count($listed['body']['data']['files']) === 3 && !isset($listed['body']['data']['usage']) && isset($api->handle('list', 'GET', $authorA, ['courseId' => 7])['body']['data']['usage']), 'API: o aluno lista os arquivos do curso; o uso da cota só aparece para quem gerencia');
    check($api->handle('show', 'GET', $studentB, ['id' => $ok['body']['data']['file']['id']])['status'] === 404, 'API: o aluno da B pede pelo id e recebe 404');
    unlink($tmp);
}

service_scenarios('em memória', new MemoryFileRepository(), new MemoryQuotaStore(), $root, $samples);

// ---------------------------------------------------------------- Range de verdade (php -S)
echo "--- Range de verdade (servidor embutido do PHP)\n";
$port = 18000 + random_int(0, 999);
$server = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', "{$root}/public"], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
register_shutdown_function(static function () use ($server): void {
    proc_terminate($server);
});
$up = false;
for ($i = 0; $i < 50 && !$up; $i++) {
    usleep(100_000);
    $up = @fsockopen('127.0.0.1', $port) !== false;
}

/** @return array{status: int, headers: array<string, string>, body: string} */
function http_get(string $url, array $headers = [], string $method = 'GET'): array
{
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => $headers, 'ignore_errors' => true, 'timeout' => 5]]);
    $body = (string) @file_get_contents($url, false, $ctx);
    $status = 0;
    $out = [];
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+ (\d{3})#', $line, $m) === 1) {
            $status = (int) $m[1];
        } elseif (str_contains($line, ':')) {
            [$k, $v] = explode(':', $line, 2);
            $out[strtolower(trim($k))] = trim($v);
        }
    }
    return ['status' => $status, 'headers' => $out, 'body' => $body];
}

if (!$up) {
    check(false, 'o php -S subiu para o teste do Range');
} else {
    $base = "http://127.0.0.1:{$port}/stream.php";
    $pdfBytes = $samples['application/pdf'];
    $size = strlen($pdfBytes);
    $whole = http_get("{$base}?f=pdf");
    check($whole['status'] === 200 && $whole['body'] === $pdfBytes && ($whole['headers']['accept-ranges'] ?? '') === 'bytes' && ($whole['headers']['content-length'] ?? '') === (string) $size, "o PDF inteiro: 200, {$size} bytes iguais à amostra e Accept-Ranges: bytes");
    $part = http_get("{$base}?f=pdf", ['Range: bytes=0-99']);
    check($part['status'] === 206 && $part['body'] === substr($pdfBytes, 0, 100) && ($part['headers']['content-range'] ?? '') === "bytes 0-99/{$size}", 'Range: bytes=0-99 ➔ 206, os 100 primeiros bytes e Content-Range certo');
    $tail = http_get("{$base}?f=pdf", ['Range: bytes=-32']);
    check($tail['status'] === 206 && $tail['body'] === substr($pdfBytes, -32), 'Range: bytes=-32 ➔ 206, os 32 últimos bytes (o leitor de PDF lê o xref do fim primeiro)');
    $mid = http_get("{$base}?f=pdf", ['Range: bytes=4000-']);
    check($mid['status'] === 206 && $mid['body'] === substr($pdfBytes, 4000) && ($mid['headers']['content-length'] ?? '') === (string) ($size - 4000), 'Range: bytes=4000- ➔ 206 do meio até o fim (o <audio> pulando para a frente)');
    $beyond = http_get("{$base}?f=pdf", ['Range: bytes=999999-']);
    check($beyond['status'] === 416 && $beyond['body'] === '' && ($beyond['headers']['content-range'] ?? '') === "bytes */{$size}", 'além do fim ➔ 416 sem corpo, com Content-Range "bytes */tamanho"');
    $head = http_get("{$base}?f=png", [], 'HEAD');
    check($head['status'] === 200 && $head['body'] === '' && ($head['headers']['content-type'] ?? '') === 'image/png' && ($head['headers']['x-content-type-options'] ?? '') === 'nosniff' && str_contains($head['headers']['content-security-policy'] ?? '', 'sandbox'), 'HEAD da imagem: só os cabeçalhos, com image/png, nosniff e CSP sandbox');
    check(($whole['headers']['cache-control'] ?? '') === 'private, no-store' && !isset($whole['headers']['content-encoding']), 'private, no-store e sem compressão (que quebraria os trechos)');
    check(http_get("{$base}?f=../samples/exemplo.pdf")['status'] === 404 && http_get("{$base}?f=pdf", [], 'POST')['status'] === 405, 'a demo só serve a lista fechada (o pedido nunca vira caminho: 404) e só GET/HEAD (405)');
}

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
    foreach (['stored_files', 'file_quota', 'schema_migrations'] as $table) {
        $pdo->exec("DROP TABLE IF EXISTS {$table}");
    }
}

// Os spikes do labs dividem o mesmo banco de teste no CI: ao sair (mesmo com erro), as tabelas daqui são apagadas.
register_shutdown_function(static function () use ($targets): void {
    foreach ($targets as $config) {
        try {
            reset_db(ConnectionFactory::create($config));
        } catch (Throwable) {
        }
    }
});

foreach ($targets as $label => $config) {
    $pdo = ConnectionFactory::create($config);
    $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    echo "=== {$label} " . (preg_match('/\d+\.\d+(\.\d+)?/', $version, $v) === 1 ? $v[0] : $version) . "\n";
    reset_db($pdo);
    $migrator = new Migrator($pdo, "{$root}/migrations");
    check($migrator->migrate() === ['000', '001', '002'] && $migrator->migrate() === [], 'migrations 000 a 002 aplicadas uma vez, em ordem (rodar de novo não faz nada)');

    service_scenarios($label, new PdoFileRepository($pdo), new PdoQuotaStore($pdo), $root, $samples);

    echo "--- envios em paralelo contra a cota ({$label})\n";
    $quota = new PdoQuotaStore($pdo);
    $quota->setQuota(9, 1000);
    $start = microtime(true) + 1.5;
    $procs = [];
    for ($i = 0; $i < 12; $i++) {
        $procs[] = proc_open([PHP_BINARY, "{$root}/scripts/quota-worker.php", json_encode($config), '9', '300', (string) $start], [1 => ['pipe', 'w']], $p);
        $pipes[$i] = $p[1];
    }
    $results = [];
    foreach ($procs as $i => $proc) {
        $results[] = trim((string) stream_get_contents($pipes[$i]));
        proc_close($proc);
    }
    $counts = array_count_values($results);
    check(($counts['ok'] ?? 0) === 3 && ($counts['full'] ?? 0) === 9 && $quota->usage(9)['used'] === 900, '12 processos reservam 300 bytes no mesmo instante, com teto de 1000: exatamente 3 passam e o uso fica em 900 (' . json_encode($counts) . ')');
    reset_db($pdo);
}

exit($failed ? 1 : 0);
