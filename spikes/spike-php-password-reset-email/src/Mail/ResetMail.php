<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

use RuntimeException;

/**
 * O e-mail do código, no idioma da tela, com os textos em arquivos de locale (nada de texto fixo no PHP).
 * Carrega só o código e a validade: nem o nome, nem as instituições da conta.
 */
final class ResetMail
{
    public const LOCALES = ['pt-BR', 'en-US'];
    public const DEFAULT_LOCALE = 'pt-BR';

    public static function locale(?string $requested): string
    {
        return in_array($requested, self::LOCALES, true) ? $requested : self::DEFAULT_LOCALE;
    }

    public static function build(string $to, string $displayCode, int $minutes, string $locale): MailMessage
    {
        $file = __DIR__ . '/locales/' . self::locale($locale) . '.json';
        $texts = json_decode((string) file_get_contents($file), true);
        if (!is_array($texts) || !is_string($texts['subject'] ?? null) || !is_array($texts['lines'] ?? null)) {
            throw new RuntimeException('MAIL_LOCALE_INVALID');
        }
        $text = strtr(implode("\n", $texts['lines']), ['{code}' => $displayCode, '{minutes}' => (string) $minutes]);
        return new MailMessage($to, $texts['subject'], str_replace("\n", "\r\n", $text));
    }
}
