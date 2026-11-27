<?php
declare(strict_types=1);

namespace Spike\Files\Http;

use Spike\Files\Storage\FileRejected;
use Spike\Files\Storage\FileService;
use Spike\Files\Storage\Viewer;

/**
 * A API dos arquivos, sem tocar em superglobais (testável). As respostas seguem o envelope do contrato do PMLife:
 * {"status":"ok","data":...} e {"status":"error","error":{"code":...}}.
 *
 *   upload  (POST, multipart, CSRF)  courseId + o arquivo      ➔ 201 com o arquivo e o uso da cota
 *   list    (GET)                    courseId                  ➔ 200 com os arquivos (e o uso, para quem gerencia)
 *   delete  (POST, CSRF)             id                        ➔ 200
 *   show    (GET)                    id                        ➔ o arquivo, pelo FileSender
 */
final class FilesApi
{
    /** @var \Closure(string): bool */
    private \Closure $isUploaded;

    /** @param (\Closure(string): bool)|null $isUploaded no servidor, is_uploaded_file; nos testes, um substituto */
    public function __construct(private readonly FileService $files, ?\Closure $isUploaded = null)
    {
        $this->isUploaded = $isUploaded ?? static fn (string $path): bool => is_uploaded_file($path);
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed>|null $upload uma entrada de $_FILES
     * @return array{status: int, body: array<string, mixed>, file?: array{file: \Spike\Files\Storage\StoredFile, stream: resource}}
     */
    public function handle(string $route, string $method, ?Viewer $viewer, array $input, ?array $upload = null,
        string $csrfSent = '', string $csrfSession = ''): array
    {
        if ($viewer === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        $expected = ['upload' => 'POST', 'delete' => 'POST', 'list' => 'GET', 'show' => 'GET'][$route] ?? null;
        if ($expected === null) {
            return self::error(404, 'NOT_FOUND');
        }
        if ($method !== $expected) {
            return self::error(405, 'METHOD_NOT_ALLOWED');
        }
        if ($method === 'POST' && ($csrfSession === '' || !hash_equals($csrfSession, $csrfSent))) {
            return self::error(403, 'CSRF_INVALID');
        }
        try {
            return match ($route) {
                'upload' => $this->upload($viewer, $input, $upload),
                'list' => $this->list($viewer, $input),
                'delete' => $this->delete($viewer, $input),
                'show' => ['status' => 200, 'body' => [], 'file' => $this->files->open($viewer, (string) ($input['id'] ?? ''))],
            };
        } catch (FileRejected $e) {
            return self::error($e->status, $e->errorCode, $e->details);
        }
    }

    /** @param array<string, mixed> $input @param array<string, mixed>|null $upload */
    private function upload(Viewer $viewer, array $input, ?array $upload): array
    {
        $courseId = (int) ($input['courseId'] ?? 0);
        if ($courseId <= 0) {
            return self::error(422, 'COURSE_INVALID');
        }
        $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            return self::error(413, 'FILE_TOO_LARGE');
        }
        $tmp = (string) ($upload['tmp_name'] ?? '');
        if ($error !== UPLOAD_ERR_OK || $tmp === '' || !($this->isUploaded)($tmp)) {
            return self::error(400, 'UPLOAD_FAILED');
        }
        $source = fopen($tmp, 'rb');
        if ($source === false) {
            return self::error(400, 'UPLOAD_FAILED');
        }
        try {
            $file = $this->files->upload($viewer, $courseId, $source, (string) ($upload['name'] ?? ''));
        } finally {
            fclose($source);
        }
        return ['status' => 201, 'body' => ['status' => 'ok', 'data' => [
            'file' => $file->toPublic(), 'usage' => self::usage($this->files->usage($viewer)),
        ]]];
    }

    /** @param array<string, mixed> $input */
    private function list(Viewer $viewer, array $input): array
    {
        $files = array_map(static fn ($f): array => $f->toPublic(), $this->files->list($viewer, (int) ($input['courseId'] ?? 0)));
        $data = ['files' => $files];
        if ($viewer->canManage) {
            $data['usage'] = self::usage($this->files->usage($viewer));
        }
        return ['status' => 200, 'body' => ['status' => 'ok', 'data' => $data]];
    }

    /** @param array<string, mixed> $input */
    private function delete(Viewer $viewer, array $input): array
    {
        $this->files->delete($viewer, (string) ($input['id'] ?? ''));
        return ['status' => 200, 'body' => ['status' => 'ok', 'data' => ['usage' => self::usage($this->files->usage($viewer))]]];
    }

    /** @param array{used: int, quota: int} $u @return array{usedBytes: int, quotaBytes: int} */
    private static function usage(array $u): array
    {
        return ['usedBytes' => $u['used'], 'quotaBytes' => $u['quota']];
    }

    /** @param array<string, int|string> $details */
    private static function error(int $status, string $code, array $details = []): array
    {
        $error = ['code' => $code] + ($details === [] ? [] : ['details' => $details]);
        return ['status' => $status, 'body' => ['status' => 'error', 'error' => $error]];
    }
}
