<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

use DateTimeImmutable;

/** Contas e códigos de recuperação (o serviço não sabe se estão no MySQL ou no PostgreSQL). */
interface ResetStore
{
    /** @return array{id: int, email: string}|null */
    public function userByEmail(string $email): ?array;

    /** Grava o código da conta, substituindo o anterior (um código ativo por conta). */
    public function saveCode(int $userId, string $codeHash, DateTimeImmutable $expiresAt, DateTimeImmutable $now): void;

    /**
     * Gasta uma tentativa do código ativo, de forma atômica: devolve o HMAC guardado, ou null se não há código válido
     * (vencido, sem tentativas ou inexistente). Pedidos em paralelo não passam de 5 tentativas.
     */
    public function spendAttempt(int $userId, DateTimeImmutable $now): ?string;

    /**
     * Troca a senha e apaga o código numa transação só, e sobe a versão das credenciais (as outras sessões caem).
     * Devolve false se o código já foi usado por outro pedido (uso único mesmo em paralelo).
     */
    public function consume(int $userId, string $codeHash, string $passwordHash): bool;

    public function credentialsVersion(int $userId): ?int;

    /** Para o Cron: apaga os códigos vencidos. */
    public function purgeExpired(DateTimeImmutable $now): int;
}
