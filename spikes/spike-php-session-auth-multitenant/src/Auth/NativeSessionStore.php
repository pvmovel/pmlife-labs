<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/**
 * Sessão nativa do PHP com o cookie endurecido (ASVS 3.4):
 * - nome com prefixo __Host- (só HTTPS, Path=/ e sem Domain: um subdomínio não consegue sobrescrevê-lo);
 * - HttpOnly (o JavaScript não lê), Secure e SameSite=Lax (o navegador não manda o cookie num POST de outro site);
 * - modo estrito (um ID inventado pelo cliente é recusado) e só por cookie (nunca na URL).
 * A sessão só abre quando alguém a usa: visitantes que não chamam a API não recebem cookie.
 */
final class NativeSessionStore implements SessionStore
{
    public const COOKIE = '__Host-spikesid';

    private bool $started = false;

    public function get(string $key): mixed
    {
        $this->start();
        return $_SESSION[$key] ?? null;
    }

    public function set(string $key, mixed $value): void
    {
        $this->start();
        $_SESSION[$key] = $value;
    }

    public function regenerate(): void
    {
        $this->start();
        session_regenerate_id(true); // true: apaga a sessão antiga no servidor
    }

    public function destroy(): void
    {
        $this->start();
        $_SESSION = [];
        session_destroy();
        $params = session_get_cookie_params();
        setcookie(self::COOKIE, '', [
            'expires' => 1,
            'path' => $params['path'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'],
        ]);
        $this->started = false;
    }

    private function start(): void
    {
        if ($this->started) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        session_name(self::COOKIE);
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
        session_cache_limiter('nocache');
        session_start();
        $this->started = true;
    }
}
