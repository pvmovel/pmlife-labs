<?php
declare(strict_types=1);

namespace Spike\Badges;

/**
 * O código do certificado: 20 caracteres no alfabeto de Crockford (sem I, L, O e U, que se confundem), com 100 bits
 * aleatórios. Ninguém adivinha o endereço de outro certificado, e o código cabe numa linha impressa (em grupos de 5).
 */
final class CertificateCode
{
    public const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    public const LENGTH = 20;

    public static function generate(): string
    {
        $out = '';
        for ($i = 0; $i < self::LENGTH; $i++) {
            $out .= self::ALPHABET[random_int(0, 31)];
        }
        return $out;
    }

    /** O código como alguém digitou (minúsculas, hífens e espaços aceitos), ou null se não for um código. */
    public static function normalize(mixed $raw): ?string
    {
        if (!is_string($raw)) {
            return null;
        }
        $code = strtoupper(str_replace(['-', ' '], '', $raw));
        return preg_match('/^[' . self::ALPHABET . ']{' . self::LENGTH . '}$/', $code) === 1 ? $code : null;
    }

    /** Em grupos de 5, para ler e imprimir. */
    public static function pretty(string $code): string
    {
        return implode('-', str_split($code, 5));
    }
}
