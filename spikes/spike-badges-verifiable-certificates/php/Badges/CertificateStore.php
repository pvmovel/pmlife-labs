<?php
declare(strict_types=1);

namespace Spike\Badges;

use PDO;
use PDOException;

/** A tabela dos certificados: emitir (um por aluno e curso) e achar pelo código. */
final class CertificateStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null o certificado do aluno no curso */
    public function ofOwner(int $tenantId, int $userId, string $courseId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM spike_certificates WHERE tenant_id = ? AND user_id = ? AND course_id = ?');
        $stmt->execute([$tenantId, $userId, $courseId]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : $r;
    }

    /** @return array<string, mixed>|null */
    public function byCode(string $code): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM spike_certificates WHERE code = ?');
        $stmt->execute([$code]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : $r;
    }

    /**
     * Emite o certificado, ou devolve o que já existe (a chave única do dono resolve dois pedidos juntos).
     *
     * @param array{studentName: string, courseTitle: string, institutionName: string, email: string} $who
     * @return array<string, mixed>
     */
    public function issue(int $tenantId, int $userId, string $courseId, array $who, string $completedOn): array
    {
        $existing = $this->ofOwner($tenantId, $userId, $courseId);
        if ($existing !== null) {
            return $existing;
        }
        $salt = bin2hex(random_bytes(16));
        try {
            $this->pdo->prepare(
                'INSERT INTO spike_certificates (code, tenant_id, user_id, course_id, student_name, course_title, institution_name, completed_on, issued_at, salt, identity_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)'
            )->execute([CertificateCode::generate(), $tenantId, $userId, $courseId, $who['studentName'], $who['courseTitle'], $who['institutionName'], $completedOn, $salt, hash('sha256', strtolower(trim($who['email'])) . $salt)]);
        } catch (PDOException $e) {
            // Outro pedido emitiu no mesmo instante (a chave única do dono): vale o dele.
            if ($e->getCode() !== '23000') {
                throw $e;
            }
        }
        return (array) $this->ofOwner($tenantId, $userId, $courseId);
    }

    /** A limpeza da demo: os certificados fictícios de mais de 1 dia somem. */
    public function purgeDemo(): void
    {
        $this->pdo->exec('DELETE FROM spike_certificates WHERE issued_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
    }
}
