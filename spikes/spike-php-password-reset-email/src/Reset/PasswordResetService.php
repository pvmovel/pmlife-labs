<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

use Closure;
use DateTimeImmutable;
use Spike\Reset\Auth\PasswordPolicy;
use Spike\Reset\Mail\Mailer;
use Spike\Reset\Mail\ResetMail;

/**
 * Recuperação de senha com um código por e-mail, digitado na mesma tela. A senha é da conta (única por e-mail), não
 * do vínculo com a instituição: nada aqui pergunta ou revela a instituição.
 */
final class PasswordResetService
{
    public const CODE_TTL_SECONDS = 900;

    public function __construct(
        private readonly ResetStore $store,
        private readonly ResetThrottle $throttle,
        private readonly PasswordPolicy $passwords,
        private readonly Mailer $mailer,
        private readonly string $secret,
    ) {
    }

    /**
     * Pede o código. O resultado é o mesmo exista a conta ou não; o envio volta como uma tarefa para DEPOIS da
     * resposta (`deliver`): o tempo do SMTP não pode revelar quem tem conta.
     *
     * @return array{error: ?string, retryAfter: ?int, deliver: Closure(): void}
     */
    public function request(string $email, string $locale, string $ip, DateTimeImmutable $now): array
    {
        $noop = static function (): void {
        };
        if (!$this->throttle->allowRequest($email, $ip, $now)) {
            return ['error' => 'RATE_LIMITED', 'retryAfter' => ResetThrottle::retryAfter($now, ResetThrottle::IP_WINDOW_SECONDS), 'deliver' => $noop];
        }
        $user = $this->store->userByEmail($email);
        if ($user === null) {
            return ['error' => null, 'retryAfter' => null, 'deliver' => $noop];
        }
        $code = ResetCode::generate();
        $this->store->saveCode($user['id'], ResetCode::hash($code, $user['id'], $this->secret), $now->modify('+' . self::CODE_TTL_SECONDS . ' seconds'), $now);
        $message = ResetMail::build($user['email'], ResetCode::display($code), intdiv(self::CODE_TTL_SECONDS, 60), $locale);
        return ['error' => null, 'retryAfter' => null, 'deliver' => fn () => $this->mailer->send($message)];
    }

    /**
     * Troca a senha com o código. Devolve o código de erro, ou null se trocou.
     * A senha nova é conferida ANTES do código: uma senha fraca ou uma confirmação diferente não gastam tentativa.
     */
    public function confirm(string $email, string $code, string $password, string $confirmation, string $ip, DateTimeImmutable $now): ?string
    {
        if (!hash_equals($password, $confirmation)) {
            return 'PASSWORD_MISMATCH';
        }
        $problem = $this->passwords->problem($password, $email);
        if ($problem !== null) {
            return $problem;
        }
        if ($this->throttle->confirmLocked($ip, $now)) {
            return 'RATE_LIMITED';
        }
        $digits = ResetCode::normalize($code);
        $user = $this->store->userByEmail($email);
        $stored = ($digits !== null && $user !== null) ? $this->store->spendAttempt($user['id'], $now) : null;
        $expected = ($stored !== null && $user !== null) ? ResetCode::hash($digits, $user['id'], $this->secret) : null;
        if ($expected === null || !hash_equals($stored, $expected)
            || !$this->store->consume($user['id'], $stored, $this->passwords->hash($password))) {
            $this->throttle->confirmFailed($ip, $now);
            return 'RESET_CODE_INVALID';
        }
        return null;
    }
}
