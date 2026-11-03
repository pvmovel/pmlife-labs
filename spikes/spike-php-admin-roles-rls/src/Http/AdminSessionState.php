<?php
declare(strict_types=1);

namespace Spike\Admin\Http;

/**
 * O que a sessão do servidor sabe de quem chama o admin: a pessoa, a instituição em que entrou e os marcadores do
 * admin (senha confirmada e último uso). Na aplicação real vem do cookie (AuthService); aqui, quem chama passa.
 */
final class AdminSessionState
{
    public function __construct(
        public readonly int $userId,
        public readonly int $tenantId,
        public readonly int $adminAuthAt,
        public readonly int $adminSeenAt,
    ) {
    }
}
