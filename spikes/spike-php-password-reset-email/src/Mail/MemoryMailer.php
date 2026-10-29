<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

/** Guarda os e-mails numa lista (testes e desenvolvimento). */
final class MemoryMailer implements Mailer
{
    /** @var list<MailMessage> */
    public array $sent = [];

    public function send(MailMessage $message): void
    {
        $this->sent[] = $message;
    }
}
