<?php
declare(strict_types=1);

namespace Spike\Reset\Mail;

/**
 * Cliente SMTP mínimo, sem Composer: TLS implícito (porta 465), AUTH LOGIN, um destinatário, texto UTF-8 em base64.
 *
 * - O certificado do servidor é sempre verificado (verify_peer e o nome do host). Para um servidor de teste, informe o
 *   arquivo da CA (cafile): a verificação continua ligada.
 * - Sem TLS só para o próprio computador (127.0.0.1 ou localhost), que é o servidor de teste do CI. Para qualquer outro
 *   host, a senha nunca sai em claro.
 * - Cada resposta do servidor é conferida; um erro vira MailFailed com a etapa e o código, sem segredos.
 */
final class SmtpMailer implements Mailer
{
    private const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];

    /** @var resource|null */
    private $socket = null;

    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly bool $tls,
        private readonly string $username,
        private readonly string $password,
        private readonly string $from,
        private readonly string $fromName,
        private readonly ?string $cafile = null,
        private readonly int $timeout = 10,
    ) {
        if (!$tls && !in_array($host, self::LOOPBACK, true)) {
            throw new MailFailed('SMTP_TLS_REQUIRED');
        }
    }

    public function send(MailMessage $message): void
    {
        $this->connect();
        try {
            $this->expect(220, 'greeting');
            $this->command('EHLO ' . $this->heloName(), 250, 'ehlo');
            $this->command('AUTH LOGIN', 334, 'auth');
            $this->command(base64_encode($this->username), 334, 'auth-user');
            $this->command(base64_encode($this->password), 235, 'auth-pass');
            $this->command("MAIL FROM:<{$this->from}>", 250, 'mail-from');
            $this->command("RCPT TO:<{$message->to}>", [250, 251], 'rcpt-to');
            $this->command('DATA', 354, 'data');
            $this->write($this->payload($message) . "\r\n.\r\n");
            $this->expect(250, 'data-end');
            $this->command('QUIT', 221, 'quit');
        } finally {
            if (is_resource($this->socket)) {
                fclose($this->socket);
            }
            $this->socket = null;
        }
    }

    /** Cabeçalhos e corpo prontos para o DATA (linhas com CRLF; base64 dispensa o "dot-stuffing"). */
    public function payload(MailMessage $message): string
    {
        $domain = substr(strrchr($this->from, '@') ?: '@localhost', 1);
        $headers = [
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . self::encodeHeader($this->fromName) . " <{$this->from}>",
            "To: <{$message->to}>",
            'Subject: ' . self::encodeHeader($message->subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . "@{$domain}>",
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            'Auto-Submitted: auto-generated',
        ];
        return implode("\r\n", $headers) . "\r\n\r\n" . rtrim(chunk_split(base64_encode($message->text), 76, "\r\n"));
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7e]/', $value) === 1 ? '=?UTF-8?B?' . base64_encode($value) . '?=' : $value;
    }

    private function heloName(): string
    {
        return substr(strrchr($this->from, '@') ?: '@localhost', 1);
    }

    private function connect(): void
    {
        $ssl = ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $this->host, 'allow_self_signed' => false];
        if ($this->cafile !== null) {
            $ssl['cafile'] = $this->cafile;
        }
        $target = ($this->tls ? 'ssl://' : 'tcp://') . "{$this->host}:{$this->port}";
        $socket = @stream_socket_client($target, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => $ssl]));
        if ($socket === false) {
            throw new MailFailed('SMTP_CONNECT_FAILED');
        }
        stream_set_timeout($socket, $this->timeout);
        $this->socket = $socket;
    }

    /** @param int|list<int> $ok */
    private function command(string $line, int|array $ok, string $step): void
    {
        $this->write($line . "\r\n");
        $this->expect($ok, $step);
    }

    private function write(string $data): void
    {
        if (fwrite($this->socket, $data) !== strlen($data)) {
            throw new MailFailed('SMTP_WRITE_FAILED');
        }
    }

    /** Lê a resposta (com as linhas "250-..." de continuação) e confere o código. @param int|list<int> $ok */
    private function expect(int|array $ok, string $step): void
    {
        $code = 0;
        do {
            $line = fgets($this->socket, 1024);
            if ($line === false) {
                throw new MailFailed("SMTP_NO_REPLY at {$step}");
            }
            $code = (int) substr($line, 0, 3);
        } while (isset($line[3]) && $line[3] === '-');
        if (!in_array($code, (array) $ok, true)) {
            throw new MailFailed("SMTP_{$code} at {$step}");
        }
    }
}
