<?php
declare(strict_types=1);

namespace Spike\Courses\Courses;

use DateTimeImmutable;

/**
 * Os documentos e os vínculos de UMA instituição (a da sessão) no banco. Nenhum método recebe o tenant: ele vem do
 * TenantContext com que o repositório foi criado. Os documentos da plataforma não ficam aqui (PlatformCatalog).
 *
 * kind: "headquarters", "course" ou "overlay" (veja a migration 002).
 */
interface DocumentRepository
{
    /** @return array{version: int, content: string, sha256: string}|null a última versão */
    public function latest(string $kind, string $slug): ?array;

    /** @return list<array{slug: string, version: int, content: string, sha256: string}> a última versão de cada um */
    public function latestOfKind(string $kind): array;

    /**
     * Grava uma versão nova (imutável). Se o conteúdo for igual ao da última versão, não grava nada.
     *
     * @return array{version: int, created: bool}
     */
    public function publish(string $kind, string $slug, string $content, string $sha256, DateTimeImmutable $now): array;

    /** @return list<array{courseId: string, adoptedVersion: int, pendingVersion: int|null, pendingProblems: list<string>}> */
    public function links(): array;

    /** @return bool false se já estava vinculado */
    public function link(string $courseId, int $version, DateTimeImmutable $now): bool;

    /** Adota a versão (e limpa a pendência). */
    public function adopt(string $courseId, int $version): void;

    /** @param list<string> $problems "CODIGO@/caminho" */
    public function hold(string $courseId, int $pendingVersion, array $problems): void;
}
