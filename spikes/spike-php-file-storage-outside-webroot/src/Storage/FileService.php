<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

use Throwable;

/**
 * Caso de uso dos arquivos da instituição.
 *
 * Envio, nesta ordem (o que é barato e não deixa rastro vem primeiro):
 *   1. quem envia gerencia o curso (403);
 *   2. vazio (422) ou maior que o limite (413);
 *   3. o tipo pelo conteúdo (415);
 *   4. a reserva atômica na cota (413 QUOTA_EXCEEDED, com o uso e o teto para o aviso);
 *   5. grava no disco e registra; se qualquer um falhar, apaga o arquivo e devolve a reserva.
 *
 * Leitura: o arquivo de outra instituição, de um curso sem matrícula ou que sumiu do disco responde 404 (NOT_FOUND),
 * igual a um id que nunca existiu: ninguém descobre que o arquivo existe.
 */
final class FileService
{
    public function __construct(
        private readonly FileStorage $storage,
        private readonly FileRepository $files,
        private readonly QuotaStore $quota,
        private readonly FileLimits $limits = new FileLimits(),
        private readonly ?\Closure $clock = null,
    ) {
    }

    /** @param resource $source */
    public function upload(Viewer $viewer, int $courseId, $source, string $originalName): StoredFile
    {
        if (!$viewer->canManage) {
            throw new FileRejected('FORBIDDEN', 403);
        }
        $size = (int) (fstat($source)['size'] ?? 0);
        if ($size === 0) {
            throw new FileRejected('EMPTY_FILE', 422);
        }
        if ($size > $this->limits->maxFileBytes) {
            throw new FileRejected('FILE_TOO_LARGE', 413, ['maxBytes' => $this->limits->maxFileBytes]);
        }
        rewind($source);
        $mime = FileSniffer::detect((string) fread($source, FileSniffer::HEAD_BYTES));
        rewind($source);
        if ($mime === null) {
            throw new FileRejected('TYPE_NOT_ALLOWED', 415);
        }
        if (!$this->quota->reserve($viewer->tenantId, $size)) {
            $usage = $this->quota->usage($viewer->tenantId);
            throw new FileRejected('QUOTA_EXCEEDED', 413, ['usedBytes' => $usage['used'], 'quotaBytes' => $usage['quota']]);
        }

        $key = null;
        try {
            // O SHA-256 fica no registro (conferir integridade, achar duplicados); o envio já está no tmp do PHP.
            $hash = hash_init('sha256');
            hash_update_stream($hash, $source);
            rewind($source);
            $key = $this->storage->put($viewer->tenantId, $source, $this->limits->maxFileBytes);
            $file = new StoredFile(
                FileName::newId(), $viewer->tenantId, $courseId, $key, $mime, $size, hash_final($hash),
                FileName::clean($originalName), $viewer->userId, $this->now(),
            );
            $this->files->insert($file);
            return $file;
        } catch (Throwable $e) {
            if ($key !== null) {
                $this->storage->delete($viewer->tenantId, $key);
            }
            $this->quota->release($viewer->tenantId, $size);
            throw $e instanceof FileRejected ? $e : new FileRejected('STORAGE_FAILED', 500);
        }
    }

    /** @return list<StoredFile> */
    public function list(Viewer $viewer, int $courseId): array
    {
        if (!$viewer->canManage && !in_array($courseId, $viewer->enrolledCourses, true)) {
            return [];
        }
        return $this->files->listByCourse($viewer->tenantId, $courseId);
    }

    /** @return array{file: StoredFile, stream: resource} */
    public function open(Viewer $viewer, string $id): array
    {
        $file = FileName::isId($id) ? $this->files->find($viewer->tenantId, $id) : null;
        if ($file === null || !$viewer->canRead($file)) {
            throw new FileRejected('NOT_FOUND', 404);
        }
        $stream = $this->storage->open($file->tenantId, $file->storageKey);
        if ($stream === null) {
            error_log('[files] registro sem arquivo no disco: ' . $file->id);
            throw new FileRejected('NOT_FOUND', 404);
        }
        return ['file' => $file, 'stream' => $stream];
    }

    public function delete(Viewer $viewer, string $id): void
    {
        $file = FileName::isId($id) ? $this->files->find($viewer->tenantId, $id) : null;
        if ($file === null || !$viewer->canRead($file)) {
            throw new FileRejected('NOT_FOUND', 404);
        }
        if (!$viewer->canManage) {
            throw new FileRejected('FORBIDDEN', 403);
        }
        // O registro sai primeiro: dois pedidos de apagar ao mesmo tempo devolvem a cota uma vez só.
        if ($this->files->delete($viewer->tenantId, $id)) {
            $this->storage->delete($file->tenantId, $file->storageKey);
            $this->quota->release($file->tenantId, $file->size);
        }
    }

    /** @return array{used: int, quota: int} */
    public function usage(Viewer $viewer): array
    {
        return $this->quota->usage($viewer->tenantId);
    }

    private function now(): string
    {
        $now = $this->clock !== null ? ($this->clock)() : new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        return $now->format('Y-m-d H:i:s');
    }
}
