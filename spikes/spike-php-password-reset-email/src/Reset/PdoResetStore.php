<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

use DateTimeImmutable;
use PDO;
use Throwable;

/** O mesmo SQL no MySQL 5.7 e no PostgreSQL 16 (sem upsert: apagar e inserir na mesma transação). Datas em UTC. */
final class PdoResetStore implements ResetStore
{
    public const MAX_ATTEMPTS = 5;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function userByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, email FROM users WHERE email = ?');
        $stmt->execute([mb_strtolower($email)]);
        $row = $stmt->fetch();
        return $row === false ? null : ['id' => (int) $row['id'], 'email' => (string) $row['email']];
    }

    public function saveCode(int $userId, string $codeHash, DateTimeImmutable $expiresAt, DateTimeImmutable $now): void
    {
        $this->transaction(function () use ($userId, $codeHash, $expiresAt, $now): void {
            $this->pdo->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([$userId]);
            $this->pdo->prepare('INSERT INTO password_resets (user_id, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)')
                ->execute([$userId, $codeHash, self::utc($expiresAt), self::utc($now)]);
        });
    }

    public function spendAttempt(int $userId, DateTimeImmutable $now): ?string
    {
        $stmt = $this->pdo->prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ? AND expires_at > ?');
        $stmt->execute([$userId, self::MAX_ATTEMPTS, self::utc($now)]);
        if ($stmt->rowCount() !== 1) {
            return null;
        }
        $read = $this->pdo->prepare('SELECT code_hash FROM password_resets WHERE user_id = ?');
        $read->execute([$userId]);
        $hash = $read->fetchColumn();
        return $hash === false ? null : (string) $hash;
    }

    public function consume(int $userId, string $codeHash, string $passwordHash): bool
    {
        return $this->transaction(function () use ($userId, $codeHash, $passwordHash): bool {
            $del = $this->pdo->prepare('DELETE FROM password_resets WHERE user_id = ? AND code_hash = ?');
            $del->execute([$userId, $codeHash]);
            if ($del->rowCount() !== 1) {
                return false;
            }
            $this->pdo->prepare('UPDATE users SET password_hash = ?, credentials_version = credentials_version + 1 WHERE id = ?')
                ->execute([$passwordHash, $userId]);
            return true;
        });
    }

    public function credentialsVersion(int $userId): ?int
    {
        $stmt = $this->pdo->prepare('SELECT credentials_version FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $v = $stmt->fetchColumn();
        return $v === false ? null : (int) $v;
    }

    public function purgeExpired(DateTimeImmutable $now): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM password_resets WHERE expires_at < ?');
        $stmt->execute([self::utc($now)]);
        return $stmt->rowCount();
    }

    private static function utc(DateTimeImmutable $t): string
    {
        return $t->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /**
     * @template T
     * @param callable(): T $work
     * @return T
     */
    private function transaction(callable $work): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $work();
            $result === false ? $this->pdo->rollBack() : $this->pdo->commit();
            return $result;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
