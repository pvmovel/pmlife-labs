<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

use InvalidArgumentException;

/** Um e-mail de texto puro. Recusa quebra de linha no destinatário e no assunto (injeção de cabeçalho). */
final class MailMessage
{
    public function __construct(
        public readonly string $to,
        public readonly string $subject,
        public readonly string $text,
    ) {
        if (preg_match('/[\r\n]/', $to . $subject) === 1 || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('MAIL_INVALID');
        }
    }
}
