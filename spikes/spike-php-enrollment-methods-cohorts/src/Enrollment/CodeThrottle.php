<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use DateTimeImmutable;
use PDO;

/**
 * Limite de erros no código de convite (US44), na tabela de limites da US30 (auth_rate_limit): no máximo 5 erros do
 * mesmo IP no mesmo curso em 15 a 30 minutos (a janela atual e a anterior). Depois disso, até o código certo é recusado,
 * para ninguém adivinhar o código por tentativa. A chave é um hash: nenhum IP fica em claro.
 */
final class CodeThrottle
{
    public const MAX_FAILURES = 5;
    private const WINDOW_SECONDS = 900;

    public function __construct(private readonly PDO $pdo, private readonly string $salt)
    {
    }

    public function blocked(int $tenantId, string $courseId, string $ip, DateTimeImmutable $now): bool
    {
        $w = intdiv($now->getTimestamp(), self::WINDOW_SECONDS);
        $stmt = $this->pdo->prepare('SELECT COALESCE(SUM(hits), 0) FROM auth_rate_limit WHERE bucket_key = ? AND window_key IN (?, ?)');
        $stmt->execute([$this->bucket($tenantId, $courseId, $ip), $w, $w - 1]);
        return (int) $stmt->fetchColumn() >= self::MAX_FAILURES;
    }

    public function fail(int $tenantId, string $courseId, string $ip, DateTimeImmutable $now): void
    {
        $sql = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql'
            ? 'INSERT INTO auth_rate_limit (bucket_key, window_key, hits) VALUES (?, ?, 1) ON CONFLICT (bucket_key, window_key) DO UPDATE SET hits = auth_rate_limit.hits + 1'
            : 'INSERT INTO auth_rate_limit (bucket_key, window_key, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1';
        $this->pdo->prepare($sql)->execute([$this->bucket($tenantId, $courseId, $ip), intdiv($now->getTimestamp(), self::WINDOW_SECONDS)]);
    }

    private function bucket(int $tenantId, string $courseId, string $ip): string
    {
        return hash('sha256', "enroll-code|{$this->salt}|{$tenantId}|{$courseId}|{$ip}");
    }
}
