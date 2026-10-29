<?php
declare(strict_types=1);

namespace Spike\Reset\Http;

use Throwable;

/**
 * Envia a resposta e SÓ DEPOIS roda o envio do e-mail: o aluno não espera o SMTP e o tempo de resposta não revela se
 * a conta existe. Fecha a conexão com fastcgi_finish_request (PHP-FPM) ou litespeed_finish_request (LiteSpeed, comum
 * em hospedagem compartilhada); sem nenhum dos dois, o envio acontece antes do fim da resposta (registrado no log).
 */
final class Responder
{
    /** @param array{status: int, body: array<string, mixed>, headers: array<string, string>, after: \Closure(): void} $result */
    public static function send(array $result): void
    {
        http_response_code($result['status']);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        foreach ($result['headers'] as $name => $value) {
            header("{$name}: {$value}");
        }
        echo json_encode($result['body'], JSON_UNESCAPED_UNICODE);
        self::finish();
        self::after($result['after']);
    }

    /** Roda a tarefa de depois da resposta. Uma falha (ex.: SMTP fora do ar) vai só para o log: a resposta já saiu. */
    public static function after(\Closure $task): void
    {
        try {
            $task();
        } catch (Throwable $e) {
            error_log('[password-reset] envio falhou: ' . $e->getMessage());
        }
    }

    /** Qual forma de fechar a resposta antes do envio este PHP tem. */
    public static function finisher(): ?string
    {
        foreach (['fastcgi_finish_request', 'litespeed_finish_request'] as $fn) {
            if (function_exists($fn)) {
                return $fn;
            }
        }
        return null;
    }

    private static function finish(): void
    {
        $fn = self::finisher();
        if ($fn !== null) {
            $fn();
            return;
        }
        error_log('[password-reset] sem fastcgi/litespeed_finish_request: e-mail enviado antes do fim da resposta');
        if (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }
}
