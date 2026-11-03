<?php
declare(strict_types=1);

namespace Spike\Admin\Access;

/**
 * Sessão de admin com prazo menor que a do jogo (US30: 2 h sem uso e 12 h no total). A sessão é a mesma (o mesmo
 * cookie); o admin só guarda os próprios marcadores: quando a senha foi confirmada para o admin (authAt) e o último
 * pedido ao admin (seenAt). Passado o prazo, o admin pede a senha de novo (401 ADMIN_REAUTH), e o jogo continua.
 */
final class AdminSession
{
    public const IDLE_SECONDS = 1800;      // 30 min sem usar o admin
    public const ABSOLUTE_SECONDS = 14400; // 4 h desde a senha

    public static function fresh(int $authAt, int $seenAt, int $now): bool
    {
        return $now - $seenAt <= self::IDLE_SECONDS && $now - $authAt <= self::ABSOLUTE_SECONDS;
    }
}
