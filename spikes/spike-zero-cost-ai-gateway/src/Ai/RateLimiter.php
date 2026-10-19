<?php
declare(strict_types=1);

namespace Spike\Ai;

/**
 * Limites por IP (por minuto e por dia) e um teto global diário, que protege a cota do free tier mesmo
 * se alguém forjar o IP. As janelas são strings ordenáveis ("m:2026-10-18T14:05", "d:2026-10-18").
 */
final class RateLimiter
{
    public function __construct(
        private RateLimitStore $store,
        private int $perMinute,
        private int $perDay,
        private int $globalPerDay,
        private string $salt,
    ) {
    }

    /** true = pode chamar a IA. Conta a tentativa mesmo quando nega (quem insiste continua bloqueado). */
    public function allow(string $ip, \DateTimeImmutable $now): bool
    {
        $who = hash('sha256', $this->salt . '|' . $ip); // nada de IP em texto puro no armazenamento
        $utc = $now->setTimezone(new \DateTimeZone('UTC'));
        $minute = $this->store->hit($who, 'm:' . $utc->format('Y-m-d\TH:i'));
        $day = $this->store->hit($who, 'd:' . $utc->format('Y-m-d'));
        if ($minute > $this->perMinute || $day > $this->perDay) {
            return false;
        }
        return $this->store->hit('global', 'd:' . $utc->format('Y-m-d')) <= $this->globalPerDay;
    }
}
