<?php
declare(strict_types=1);

namespace Spike\Reset\Http;

use Closure;
use DateTimeImmutable;
use Spike\Reset\Reset\PasswordResetService;

/**
 * As duas rotas no envelope do contrato ({status, data} / {status, error: {code}}), sem depender do HTTP.
 * Na Etapa 2, o CSRF e o "só JSON" vêm do JsonApi::postInput, como no login.
 *
 *   POST /api/auth/password-reset/request  {email, locale}                       ➔ 202, igual com ou sem conta
 *   POST /api/auth/password-reset/confirm  {email, code, password, confirmation} ➔ 200 | 400 | 429
 */
final class ResetApi
{
    public function __construct(private readonly PasswordResetService $service)
    {
    }

    /**
     * @param array<string, mixed> $input
     * @return array{status: int, body: array<string, mixed>, headers: array<string, string>, after: Closure(): void}
     */
    public function handle(string $route, array $input, string $ip, DateTimeImmutable $now): array
    {
        $none = static function (): void {
        };
        $email = mb_strtolower(trim(is_string($input['email'] ?? null) ? $input['email'] : ''));
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 254) {
            return self::error(400, 'INVALID_REQUEST', $none);
        }
        if ($route === 'request') {
            $locale = is_string($input['locale'] ?? null) ? $input['locale'] : '';
            $out = $this->service->request($email, $locale, $ip, $now);
            if ($out['error'] !== null) {
                return self::error(429, $out['error'], $none, ['Retry-After' => (string) $out['retryAfter']]);
            }
            return ['status' => 202, 'body' => ['status' => 'ok', 'data' => ['accepted' => true]], 'headers' => [], 'after' => $out['deliver']];
        }
        if ($route === 'confirm') {
            $fields = [];
            foreach (['code', 'password', 'confirmation'] as $f) {
                if (!is_string($input[$f] ?? null)) {
                    return self::error(400, 'INVALID_REQUEST', $none);
                }
                $fields[$f] = $input[$f];
            }
            $error = $this->service->confirm($email, $fields['code'], $fields['password'], $fields['confirmation'], $ip, $now);
            if ($error === null) {
                return ['status' => 200, 'body' => ['status' => 'ok', 'data' => ['changed' => true]], 'headers' => [], 'after' => $none];
            }
            return self::error($error === 'RATE_LIMITED' ? 429 : 400, $error, $none);
        }
        return self::error(404, 'NOT_FOUND', $none);
    }

    /** @param array<string, string> $headers */
    private static function error(int $status, string $code, Closure $after, array $headers = []): array
    {
        return ['status' => $status, 'body' => ['status' => 'error', 'error' => ['code' => $code]], 'headers' => $headers, 'after' => $after];
    }
}
