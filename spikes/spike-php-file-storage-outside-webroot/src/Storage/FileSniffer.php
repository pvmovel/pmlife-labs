<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/**
 * Descobre o tipo pelo CONTEÚDO (a assinatura nos primeiros bytes), nunca pela extensão nem pelo Content-Type que o
 * navegador mandou. Só passa o que o produto usa: PDF, áudio (MP3, M4A, OGG com Vorbis ou Opus) e imagem (JPEG, PNG,
 * WebP, GIF). O resto (SVG, HTML, executável, ZIP, vídeo...) é recusado: lista de permitidos, não de proibidos.
 */
final class FileSniffer
{
    /** Quantos bytes do começo bastam para todas as assinaturas abaixo. */
    public const HEAD_BYTES = 64;

    public const ALLOWED = [
        'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    ];

    /** @return string|null o MIME conferido, ou null se o conteúdo não é de um tipo permitido */
    public static function detect(string $head): ?string
    {
        if (str_starts_with($head, '%PDF-')) {
            return 'application/pdf';
        }
        if (str_starts_with($head, "\xFF\xD8\xFF")) {
            return 'image/jpeg';
        }
        if (str_starts_with($head, "\x89PNG\r\n\x1A\n")) {
            return 'image/png';
        }
        if (str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a')) {
            return 'image/gif';
        }
        if (str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP') {
            return 'image/webp';
        }
        if (self::isMp3($head)) {
            return 'audio/mpeg';
        }
        if (self::isM4a($head)) {
            return 'audio/mp4';
        }
        if (str_starts_with($head, 'OggS') && (str_contains($head, "\x01vorbis") || str_contains($head, 'OpusHead'))) {
            return 'audio/ogg';
        }
        return null;
    }

    /** MP3 com etiqueta ID3v2 ou começando direto num quadro MPEG Layer III válido. */
    private static function isMp3(string $h): bool
    {
        if (strlen($h) >= 4 && str_starts_with($h, 'ID3') && in_array(ord($h[3]), [2, 3, 4], true)) {
            return true;
        }
        if (strlen($h) < 3 || ord($h[0]) !== 0xFF || (ord($h[1]) & 0xE0) !== 0xE0) {
            return false;
        }
        $layer = (ord($h[1]) >> 1) & 0x03;     // 01 = Layer III (o AAC em ADTS tem 00 e fica de fora)
        $version = (ord($h[1]) >> 3) & 0x03;   // 01 é reservado
        $bitrate = ord($h[2]) >> 4;            // 0000 (livre) e 1111 (inválido) ficam de fora
        $rate = (ord($h[2]) >> 2) & 0x03;      // 11 é reservado
        return $layer === 1 && $version !== 1 && $bitrate !== 0 && $bitrate !== 15 && $rate !== 3;
    }

    /** M4A: caixa ftyp com a marca de áudio (M4A ou M4B) como principal ou compatível. Um MP4 de vídeo fica de fora. */
    private static function isM4a(string $h): bool
    {
        if (strlen($h) < 16 || substr($h, 4, 4) !== 'ftyp') {
            return false;
        }
        $boxSize = min((int) unpack('N', substr($h, 0, 4))[1], strlen($h));
        $brands = [substr($h, 8, 4)];
        for ($i = 16; $i + 4 <= $boxSize; $i += 4) {
            $brands[] = substr($h, $i, 4);
        }
        return array_intersect($brands, ['M4A ', 'M4B ']) !== [];
    }
}
