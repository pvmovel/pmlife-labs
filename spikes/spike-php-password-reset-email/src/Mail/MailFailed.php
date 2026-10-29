<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

use RuntimeException;

/** Falha de envio. A mensagem diz só a etapa e o código SMTP: nunca a senha nem o conteúdo do e-mail. */
final class MailFailed extends RuntimeException
{
}
