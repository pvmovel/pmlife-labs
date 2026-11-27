<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/** O registro dos arquivos. Toda busca leva o tenant: um id de outra instituição simplesmente não existe aqui. */
interface FileRepository
{
    public function insert(StoredFile $file): void;

    public function find(int $tenantId, string $id): ?StoredFile;

    /** @return list<StoredFile> do mais novo para o mais antigo */
    public function listByCourse(int $tenantId, int $courseId): array;

    /** @return bool false se já não existia (outro pedido apagou antes) */
    public function delete(int $tenantId, string $id): bool;
}
