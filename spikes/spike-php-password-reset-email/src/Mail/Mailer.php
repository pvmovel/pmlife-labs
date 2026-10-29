<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

/** O Port de envio: SMTP em homolog e produção; em memória nos testes. */
interface Mailer
{
    /** @throws MailFailed */
    public function send(MailMessage $message): void;
}
