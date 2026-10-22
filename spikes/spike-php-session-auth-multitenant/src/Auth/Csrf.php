<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/**
 * Token sincronizador contra CSRF (ASVS 4.2.2): guardado na sessão, entregue pelo GET /api/me e exigido no cabeçalho
 * X-CSRF-Token de todo POST, inclusive login e cadastro (contra "login CSRF"). Soma-se ao SameSite=Lax do cookie.
 * Troca depois do login e do cadastro, junto com o ID da sessão.
 */
final class Csrf
{
    private const KEY = 'csrf';

    public function __construct(private readonly SessionStore $session)
    {
    }

    public function token(): string
    {
        $token = $this->session->get(self::KEY);
        if (!is_string($token)) {
            $token = $this->rotate();
        }
        return $token;
    }

    public function rotate(): string
    {
        $token = bin2hex(random_bytes(32));
        $this->session->set(self::KEY, $token);
        return $token;
    }

    public function valid(?string $sent): bool
    {
        $token = $this->session->get(self::KEY);
        return is_string($token) && is_string($sent) && hash_equals($token, $sent);
    }
}
