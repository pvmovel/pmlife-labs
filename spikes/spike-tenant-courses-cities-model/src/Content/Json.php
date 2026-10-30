<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

use JsonException;

/**
 * Um documento como texto. A forma canônica (sem espaços, Unicode e barras sem escape, 1.0 continua 1.0, {} continua
 * {}) é o que se grava e o que entra no hash: reenviar o mesmo conteúdo com outra formatação não cria versão nova, e
 * o ETag não muda.
 */
final class Json
{
    public const MAX_BYTES = 524288; // 512 KiB: o curso de exemplo inteiro (cidade e fases) tem ~6 KB
    private const DEPTH = 32;
    private const FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR;

    /** @throws JsonException */
    public static function canonical(string $json): string
    {
        return json_encode(json_decode($json, false, self::DEPTH, JSON_THROW_ON_ERROR), self::FLAGS);
    }

    /** Valor já decodificado como objetos (stdClass), por exemplo o campo "content" do corpo do pedido. */
    public static function canonicalValue(mixed $value): string
    {
        return json_encode($value, self::FLAGS);
    }

    /**
     * Arrays associativos (o que o validador e a mescla usam) de volta para a forma canônica. Um objeto vazio vira
     * {} (e não []) nos campos que são mapas.
     */
    public static function encodeArray(array $doc): string
    {
        return self::canonical(json_encode(self::objects($doc), self::FLAGS));
    }

    /**
     * @return mixed arrays associativos, para o validador
     * @throws JsonException
     */
    public static function decode(string $json): mixed
    {
        return json_decode($json, true, self::DEPTH, JSON_THROW_ON_ERROR);
    }

    /** Chaves que são sempre mapas: vazias, voltam a ser {}. As outras vazias continuam []. */
    private const MAPS = ['texts', 'pt-BR', 'en-US', 'minAttributes'];

    private static function objects(mixed $v, ?string $key = null): mixed
    {
        if (!is_array($v)) {
            return $v;
        }
        if ($v === []) {
            return in_array($key, self::MAPS, true) ? new \stdClass() : [];
        }
        $out = [];
        foreach ($v as $k => $e) {
            $out[$k] = self::objects($e, is_string($k) ? $k : null);
        }
        return array_is_list($out) ? $out : (object) $out;
    }
}
