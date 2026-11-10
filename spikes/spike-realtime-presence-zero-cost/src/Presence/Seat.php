<?php
declare(strict_types=1);

namespace Spike\Presence;

/**
 * Quem está pedindo e em que sala: tudo vem da sessão do servidor, nunca do corpo do pedido. No produto, é o
 * TenantContext da sessão (instituição e pessoa), a matrícula (a turma) e a cidade em que o aluno entrou, conferida
 * contra o curso. A sede não tem presença (decisão do Pablo): só a cidade do curso e as fases.
 */
final class Seat
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly string $name,
        public readonly string $city,
        public readonly string $cohort,
        public readonly bool $staff = false,
        public readonly bool $visible = true,
    ) {
    }
}
