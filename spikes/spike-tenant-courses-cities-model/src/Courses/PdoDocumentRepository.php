<?php
declare(strict_types=1);

namespace Spike\Courses\Courses;

use DateTimeImmutable;
use PDOException;
use RuntimeException;
use Spike\Courses\Tenant\TenantScopedRepository;

/**
 * Documentos e vínculos da instituição no MySQL 5.7 ou no PostgreSQL, com o MESMO SQL nos dois dialetos (sem upsert,
 * sem window function, sem CTE). Todo comando passa pelo filtro de tenant da base (e, no PostgreSQL, também pelo RLS).
 */
final class PdoDocumentRepository extends TenantScopedRepository implements DocumentRepository
{
    public function latest(string $kind, string $slug): ?array
    {
        $row = $this->run(
            'SELECT v.version, v.content, v.content_sha256 FROM course_documents d'
            . ' JOIN course_document_versions v ON v.document_id = d.id AND v.tenant_id = d.tenant_id'
            . ' WHERE d.tenant_id = :tenant_id AND d.kind = :kind AND d.slug = :slug ORDER BY v.version DESC LIMIT 1',
            ['kind' => $kind, 'slug' => $slug]
        )->fetch();
        return $row === false ? null : self::version($row);
    }

    public function latestOfKind(string $kind): array
    {
        // A maior versão de cada documento por subconsulta correlata (o MySQL 5.7 não tem window function).
        $rows = $this->run(
            'SELECT d.slug, v.version, v.content, v.content_sha256 FROM course_documents d'
            . ' JOIN course_document_versions v ON v.document_id = d.id AND v.tenant_id = d.tenant_id'
            . ' WHERE d.tenant_id = :tenant_id AND d.kind = :kind'
            . ' AND v.version = (SELECT MAX(m.version) FROM course_document_versions m WHERE m.document_id = d.id)'
            . ' ORDER BY d.slug',
            ['kind' => $kind]
        )->fetchAll();
        return array_map(static fn (array $r): array => ['slug' => (string) $r['slug']] + self::version($r), $rows);
    }

    public function publish(string $kind, string $slug, string $content, string $sha256, DateTimeImmutable $now): array
    {
        $at = $now->format('Y-m-d H:i:s');
        // A linha do documento nasce fora da transação: no PostgreSQL, um INSERT que falha (duas publicações da
        // primeira versão ao mesmo tempo) invalida a transação inteira. A chave única (tenant, kind, slug) decide quem cria.
        $documentId = $this->documentId($kind, $slug);
        if ($documentId === null) {
            try {
                $this->run(
                    'INSERT INTO course_documents (tenant_id, kind, slug, created_at) VALUES (:tenant_id, :kind, :slug, :at)',
                    ['kind' => $kind, 'slug' => $slug, 'at' => $at]
                );
            } catch (PDOException $e) {
                if (!self::isDuplicate($e)) {
                    throw $e;
                }
            }
            $documentId = $this->documentId($kind, $slug) ?? throw new RuntimeException('documento sumiu depois de criado');
        }

        $this->pdo->beginTransaction();
        try {
            // Trava o documento: duas publicações simultâneas viram uma fila, e a versão nunca se repete nem pula.
            $this->run('SELECT id FROM course_documents WHERE tenant_id = :tenant_id AND id = :id FOR UPDATE', ['id' => $documentId]);
            $last = $this->run(
                'SELECT version, content_sha256 FROM course_document_versions WHERE tenant_id = :tenant_id AND document_id = :id'
                . ' ORDER BY version DESC LIMIT 1',
                ['id' => $documentId]
            )->fetch();
            if ($last !== false && hash_equals((string) $last['content_sha256'], $sha256)) {
                $this->pdo->commit();
                return ['version' => (int) $last['version'], 'created' => false];
            }
            $version = $last === false ? 1 : (int) $last['version'] + 1;
            $this->run(
                'INSERT INTO course_document_versions (tenant_id, document_id, version, content, content_sha256, published_by, published_at)'
                . ' VALUES (:tenant_id, :id, :version, :content, :sha, :by, :at)',
                ['id' => $documentId, 'version' => $version, 'content' => $content, 'sha' => $sha256, 'by' => $this->tenant->userId, 'at' => $at]
            );
            $this->pdo->commit();
            return ['version' => $version, 'created' => true];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function links(): array
    {
        $rows = $this->run(
            'SELECT course_id, adopted_version, pending_version, pending_problems FROM course_links WHERE tenant_id = :tenant_id ORDER BY course_id'
        )->fetchAll();
        return array_map(static fn (array $r): array => [
            'courseId' => (string) $r['course_id'],
            'adoptedVersion' => (int) $r['adopted_version'],
            'pendingVersion' => $r['pending_version'] === null ? null : (int) $r['pending_version'],
            'pendingProblems' => $r['pending_problems'] === null ? [] : (array) json_decode((string) $r['pending_problems'], true),
        ], $rows);
    }

    public function link(string $courseId, int $version, DateTimeImmutable $now): bool
    {
        try {
            $this->run(
                'INSERT INTO course_links (tenant_id, course_id, adopted_version, linked_at) VALUES (:tenant_id, :course_id, :version, :at)',
                ['course_id' => $courseId, 'version' => $version, 'at' => $now->format('Y-m-d H:i:s')]
            );
            return true;
        } catch (PDOException $e) {
            if (self::isDuplicate($e)) {
                return false;
            }
            throw $e;
        }
    }

    public function adopt(string $courseId, int $version): void
    {
        $this->run(
            'UPDATE course_links SET adopted_version = :version, pending_version = NULL, pending_problems = NULL'
            . ' WHERE tenant_id = :tenant_id AND course_id = :course_id',
            ['version' => $version, 'course_id' => $courseId]
        );
    }

    public function hold(string $courseId, int $pendingVersion, array $problems): void
    {
        $this->run(
            'UPDATE course_links SET pending_version = :version, pending_problems = :problems WHERE tenant_id = :tenant_id AND course_id = :course_id',
            ['version' => $pendingVersion, 'problems' => json_encode(array_values($problems), JSON_UNESCAPED_SLASHES), 'course_id' => $courseId]
        );
    }

    private function documentId(string $kind, string $slug): ?int
    {
        $id = $this->run(
            'SELECT id FROM course_documents WHERE tenant_id = :tenant_id AND kind = :kind AND slug = :slug',
            ['kind' => $kind, 'slug' => $slug]
        )->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /** @return array{version: int, content: string, sha256: string} */
    private static function version(array $r): array
    {
        return ['version' => (int) $r['version'], 'content' => (string) $r['content'], 'sha256' => (string) $r['content_sha256']];
    }

    private static function isDuplicate(PDOException $e): bool
    {
        return in_array((string) $e->getCode(), ['23000', '23505'], true);
    }
}
