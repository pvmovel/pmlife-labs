<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

use DateTimeImmutable;
use Spike\Reset\Auth\ThrottleStore;

/**
 * Limites da recuperação de senha, na tabela de limites da US30, contando a janela atual e a anterior:
 * - pedidos de código: 3 por e-mail em janelas de 1 h (vale também para e-mail sem conta: a resposta é a mesma) e
 *   10 por IP em janelas de 15 min (contra disparar e-mails para muitas contas);
 * - trocas com código errado: 20 por IP em janelas de 15 min (o limite de 5 erros por código fica na tabela dos códigos).
 * Chaves só como hash com sal: nem o e-mail nem o IP ficam em claro.
 */
final class ResetThrottle
{
    public const REQUEST_WINDOW_SECONDS = 3600;
    public const IP_WINDOW_SECONDS = 900;
    public const MAX_REQUESTS_PER_ACCOUNT = 3;
    public const MAX_REQUESTS_PER_IP = 10;
    public const MAX_CONFIRM_FAILURES_PER_IP = 20;

    public function __construct(private readonly ThrottleStore $store, private readonly string $salt)
    {
    }

    /** Conta mais um pedido e diz se ainda cabe. Passou do limite, nada é contado (o 429 não estende o bloqueio). */
    public function allowRequest(string $email, string $ip, DateTimeImmutable $now): bool
    {
        $account = $this->bucket('reset-account', mb_strtolower($email));
        $byIp = $this->bucket('reset-ip', $ip);
        if ($this->store->count($account, $this->windows($now, self::REQUEST_WINDOW_SECONDS)) >= self::MAX_REQUESTS_PER_ACCOUNT
            || $this->store->count($byIp, $this->windows($now, self::IP_WINDOW_SECONDS)) >= self::MAX_REQUESTS_PER_IP) {
            return false;
        }
        $this->store->hit($account, intdiv($now->getTimestamp(), self::REQUEST_WINDOW_SECONDS));
        $this->store->hit($byIp, intdiv($now->getTimestamp(), self::IP_WINDOW_SECONDS));
        return true;
    }

    public function confirmLocked(string $ip, DateTimeImmutable $now): bool
    {
        return $this->store->count($this->bucket('reset-fail-ip', $ip), $this->windows($now, self::IP_WINDOW_SECONDS)) >= self::MAX_CONFIRM_FAILURES_PER_IP;
    }

    public function confirmFailed(string $ip, DateTimeImmutable $now): void
    {
        $this->store->hit($this->bucket('reset-fail-ip', $ip), intdiv($now->getTimestamp(), self::IP_WINDOW_SECONDS));
    }

    /** Segundos até o bloqueio poder cair (o fim da janela seguinte, no pior caso). */
    public static function retryAfter(DateTimeImmutable $now, int $windowSeconds): int
    {
        return $windowSeconds - ($now->getTimestamp() % $windowSeconds) + $windowSeconds;
    }

    /** @return list<int> */
    private function windows(DateTimeImmutable $now, int $seconds): array
    {
        $w = intdiv($now->getTimestamp(), $seconds);
        return [$w - 1, $w];
    }

    private function bucket(string $kind, string $value): string
    {
        return hash('sha256', "{$kind}|{$this->salt}|{$value}");
    }
}
