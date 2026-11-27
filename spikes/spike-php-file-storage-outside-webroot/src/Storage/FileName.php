<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** Ids gerados pelo servidor e o nome original limpo (que só aparece no download, nunca vira caminho). */
final class FileName
{
    public const ID_PATTERN = '/^[0-9a-f]{32}$/';

    public static function newId(): string
    {
        return bin2hex(random_bytes(16));
    }

    public static function isId(string $value): bool
    {
        return preg_match(self::ID_PATTERN, $value) === 1;
    }

    /** Tira caminho, caracteres de controle e separadores; corta em 120 caracteres; vazio vira "arquivo". */
    public static function clean(string $name): string
    {
        $name = str_replace("\0", '', $name);
        $name = basename(str_replace('\\', '/', $name));
        $name = (string) preg_replace('/[\x00-\x1F\x7F"\/\\\\<>:|?*]+/u', '', $name);
        $name = trim((string) preg_replace('/\s+/u', ' ', $name), " .");
        if (!mb_check_encoding($name, 'UTF-8')) {
            $name = (string) mb_convert_encoding($name, 'UTF-8', 'UTF-8');
        }
        $name = mb_substr($name, 0, 120);
        return $name === '' ? 'arquivo' : $name;
    }
}
