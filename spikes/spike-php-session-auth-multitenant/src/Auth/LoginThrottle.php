<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

use DateTimeImmutable;

/**
 * Limite de tentativas (ASVS 2.2.1), em janelas de 15 min contando a atual e a anterior:
 * - 5 erros da mesma conta pelo mesmo IP bloqueiam esse par (Gherkin: "aquela conta e aquele IP");
 * - 20 erros do mesmo IP, em contas quaisquer, bloqueiam o IP (contra testar senhas comuns em muitas contas);
 * - de outro IP, a conta continua entrando: um atacante não consegue trancar o aluno fora só errando a senha dele.
 * Somar a janela anterior impede o truque de errar 4 vezes no fim de uma janela e 4 no começo da seguinte.
 * O bloqueio é verificado ANTES da senha: a 6ª tentativa é recusada mesmo com a senha certa.
 * Cadastros usam o mesmo mecanismo, por IP (10 por janela).
 */
final class LoginThrottle
{
    public const WINDOW_SECONDS = 900;
    public const MAX_PER_ACCOUNT_AND_IP = 5;
    public const MAX_PER_IP = 20;
    public const MAX_SIGNUPS_PER_IP = 10;

    public function __construct(private readonly ThrottleStore $store, private readonly string $salt)
    {
    }

    public function loginLocked(string $email, string $ip, DateTimeImmutable $now): bool
    {
        $windows = $this->windows($now);
        return $this->store->count($this->pair($email, $ip), $windows) >= self::MAX_PER_ACCOUNT_AND_IP
            || $this->store->count($this->ip($ip), $windows) >= self::MAX_PER_IP;
    }

    public function loginFailed(string $email, string $ip, DateTimeImmutable $now): void
    {
        $window = $this->window($now);
        $this->store->hit($this->pair($email, $ip), $window);
        $this->store->hit($this->ip($ip), $window);
    }

    /** Login certo zera o par (os erros do IP continuam valendo contra o ataque a muitas contas). */
    public function loginSucceeded(string $email, string $ip): void
    {
        $this->store->clear($this->pair($email, $ip));
    }

    /** Conta mais um cadastro do IP e diz se ainda cabe. */
    public function allowSignup(string $ip, DateTimeImmutable $now): bool
    {
        $bucket = hash('sha256', "signup|{$this->salt}|{$ip}");
        if ($this->store->count($bucket, $this->windows($now)) >= self::MAX_SIGNUPS_PER_IP) {
            return false;
        }
        $this->store->hit($bucket, $this->window($now));
        return true;
    }

    /** Segundos até o bloqueio poder cair (o fim da janela seguinte, no pior caso). */
    public function retryAfter(DateTimeImmutable $now): int
    {
        return self::WINDOW_SECONDS - ($now->getTimestamp() % self::WINDOW_SECONDS) + self::WINDOW_SECONDS;
    }

    private function window(DateTimeImmutable $now): int
    {
        return intdiv($now->getTimestamp(), self::WINDOW_SECONDS);
    }

    /** @return list<int> */
    private function windows(DateTimeImmutable $now): array
    {
        $w = $this->window($now);
        return [$w - 1, $w];
    }

    // E-mail e IP nunca ficam em claro na tabela: só o hash com sal (LGPD, dado mínimo).
    private function pair(string $email, string $ip): string
    {
        return hash('sha256', "pair|{$this->salt}|" . mb_strtolower($email) . "|{$ip}");
    }

    private function ip(string $ip): string
    {
        return hash('sha256', "ip|{$this->salt}|{$ip}");
    }
}
