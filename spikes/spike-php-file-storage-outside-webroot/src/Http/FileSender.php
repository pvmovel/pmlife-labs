<?php
declare(strict_types=1);

namespace Spike\Files\Http;

use Spike\Files\Storage\StoredFile;

/**
 * Entrega o arquivo pelo PHP, inteiro ou em trechos (Range), em blocos de 8 KB: o arquivo nunca vai inteiro para a
 * memória, e o áudio avança sem baixar tudo.
 *
 * Os cabeçalhos são a segunda barreira, depois do tipo conferido no envio:
 *   - Content-Type é o conferido pelo conteúdo, e o nosniff impede o navegador de adivinhar outro;
 *   - imagem e áudio vão com CSP "sandbox": mesmo um GIF com HTML escondido não roda script na origem do campus;
 *     o PDF vai sem o sandbox, porque o leitor de PDF do Chrome se recusa a abrir dentro dele (conferir na demo);
 *   - Cache-Control private, no-store: o Cloudflare e o navegador não guardam o material de quem tem matrícula;
 *   - sem gzip: a compressão do servidor mudaria o tamanho e quebraria os trechos.
 */
final class FileSender
{
    private const CHUNK = 8192;

    /**
     * O plano da resposta, sem enviar nada (testável).
     *
     * @return array{status: int, headers: array<string, string>, start: int, length: int}
     */
    public static function plan(StoredFile $file, ?string $rangeHeader, bool $download = false): array
    {
        $size = $file->size;
        $range = ByteRange::parse($rangeHeader, $size);
        $headers = [
            'Content-Type' => $file->mime,
            'X-Content-Type-Options' => 'nosniff',
            'Accept-Ranges' => 'bytes',
            'Cache-Control' => 'private, no-store',
            'Content-Disposition' => self::disposition($file->originalName, $download),
        ];
        if ($file->mime !== 'application/pdf') {
            $headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
        }
        if ($range === ByteRange::UNSATISFIABLE) {
            $headers['Content-Range'] = "bytes */{$size}";
            $headers['Content-Length'] = '0';
            return ['status' => 416, 'headers' => $headers, 'start' => 0, 'length' => 0];
        }
        if ($range === ByteRange::FULL) {
            $headers['Content-Length'] = (string) $size;
            return ['status' => 200, 'headers' => $headers, 'start' => 0, 'length' => $size];
        }
        [$start, $end] = $range;
        $headers['Content-Range'] = "bytes {$start}-{$end}/{$size}";
        $headers['Content-Length'] = (string) ($end - $start + 1);
        return ['status' => 206, 'headers' => $headers, 'start' => $start, 'length' => $end - $start + 1];
    }

    /** @param resource $stream */
    public static function send(StoredFile $file, $stream, ?string $rangeHeader, bool $headOnly = false): void
    {
        $plan = self::plan($file, $rangeHeader);
        self::noCompression();
        http_response_code($plan['status']);
        foreach ($plan['headers'] as $name => $value) {
            header("{$name}: {$value}");
        }
        if ($headOnly || $plan['length'] === 0) {
            fclose($stream);
            return;
        }
        @set_time_limit(0);
        fseek($stream, $plan['start']);
        $left = $plan['length'];
        while ($left > 0 && !feof($stream) && connection_status() === CONNECTION_NORMAL) {
            $chunk = fread($stream, min(self::CHUNK, $left));
            if ($chunk === false || $chunk === '') {
                break;
            }
            echo $chunk;
            $left -= strlen($chunk);
            flush();
        }
        fclose($stream);
    }

    /** inline para ver no campus; o nome em ASCII para navegadores antigos e em UTF-8 (RFC 6266) para os outros. */
    public static function disposition(string $name, bool $download): string
    {
        $ascii = (string) preg_replace('/[^A-Za-z0-9._ -]/u', '_', $name);
        $type = $download ? 'attachment' : 'inline';
        return sprintf('%s; filename="%s"; filename*=UTF-8\'\'%s', $type, $ascii, rawurlencode($name));
    }

    private static function noCompression(): void
    {
        @ini_set('zlib.output_compression', 'Off');
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
    }
}
