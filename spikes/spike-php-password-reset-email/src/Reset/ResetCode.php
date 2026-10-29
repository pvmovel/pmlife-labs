<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

/**
 * O código que o aluno recebe por e-mail e digita na mesma tela: 8 dígitos (fácil de digitar no celular).
 * Com 5 tentativas por código e 3 códigos por hora, um atacante acerta com chance de 15 em 100 milhões por hora.
 * No banco fica só o HMAC (com um segredo do env e a conta): quem lê a tabela não descobre o código.
 */
final class ResetCode
{
    public const DIGITS = 8;

    public static function generate(): string
    {
        return str_pad((string) random_int(0, 10 ** self::DIGITS - 1), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /** Aceita o código com espaços, pontos ou hífens (como o aluno copia do e-mail); null se não tiver 8 dígitos. */
    public static function normalize(string $input): ?string
    {
        $digits = preg_replace('/[\s.\-]/u', '', $input) ?? '';
        return preg_match('/^\d{' . self::DIGITS . '}$/', $digits) === 1 ? $digits : null;
    }

    /** Como o código aparece no e-mail: "1234 5678". */
    public static function display(string $code): string
    {
        return substr($code, 0, 4) . ' ' . substr($code, 4);
    }

    public static function hash(string $code, int $userId, string $secret): string
    {
        return hash_hmac('sha256', "{$userId}|{$code}", $secret);
    }
}
