<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

use InvalidArgumentException;
use RuntimeException;

/**
 * O disco da hospedagem: <raiz>/t<tenant>/<chave>, sem extensão.
 *
 * - A raiz vem da configuração (no PMLife, o .env.php fora do webroot) e é recusada se ficar dentro do webroot: um
 *   arquivo enviado nunca pode ser chamado pela URL, nem executado como PHP.
 * - O tenant é um inteiro positivo e a chave tem 32 hex: nada vindo do pedido vira caminho (sem path traversal).
 * - A gravação vai para um temporário na mesma pasta e entra com rename (atômico): ninguém lê um arquivo pela metade.
 */
final class LocalDiskStorage implements FileStorage
{
    private const CHUNK = 8192;

    private string $root;

    public function __construct(string $root, ?string $webroot = null)
    {
        if (!is_dir($root) && !@mkdir($root, 0750, true) && !is_dir($root)) {
            throw new RuntimeException('STORAGE_ROOT_UNAVAILABLE');
        }
        $real = realpath($root);
        if ($real === false) {
            throw new RuntimeException('STORAGE_ROOT_UNAVAILABLE');
        }
        if ($webroot !== null) {
            $web = realpath($webroot);
            if ($web !== false && ($real === $web || str_starts_with($real . '/', rtrim($web, '/') . '/'))) {
                throw new RuntimeException('STORAGE_ROOT_INSIDE_WEBROOT');
            }
        }
        $this->root = $real;
    }

    public function put(int $tenantId, $source, int $maxBytes): string
    {
        $dir = $this->tenantDir($tenantId, true);
        $tmp = tempnam($dir, '.up-');
        if ($tmp === false) {
            throw new RuntimeException('STORAGE_WRITE_FAILED');
        }
        $out = fopen($tmp, 'wb');
        if ($out === false) {
            @unlink($tmp);
            throw new RuntimeException('STORAGE_WRITE_FAILED');
        }
        $written = 0;
        try {
            while (!feof($source)) {
                $chunk = fread($source, self::CHUNK);
                if ($chunk === false) {
                    throw new RuntimeException('STORAGE_WRITE_FAILED');
                }
                $written += strlen($chunk);
                if ($written > $maxBytes) {
                    throw new FileRejected('FILE_TOO_LARGE', 413, ['maxBytes' => $maxBytes]);
                }
                if (fwrite($out, $chunk) !== strlen($chunk)) {
                    throw new RuntimeException('STORAGE_WRITE_FAILED');
                }
            }
        } catch (\Throwable $e) {
            fclose($out);
            @unlink($tmp);
            throw $e;
        }
        fclose($out);
        chmod($tmp, 0640);
        $key = FileName::newId();
        if (!rename($tmp, $dir . '/' . $key)) {
            @unlink($tmp);
            throw new RuntimeException('STORAGE_WRITE_FAILED');
        }
        return $key;
    }

    public function open(int $tenantId, string $key)
    {
        $path = $this->path($tenantId, $key);
        if ($path === null || !is_file($path)) {
            return null;
        }
        $handle = fopen($path, 'rb');
        return $handle === false ? null : $handle;
    }

    public function delete(int $tenantId, string $key): void
    {
        $path = $this->path($tenantId, $key);
        if ($path !== null && is_file($path)) {
            unlink($path);
        }
    }

    /** Para os testes: onde a chave fica no disco (ou null se a entrada não é válida). */
    public function path(int $tenantId, string $key): ?string
    {
        if ($tenantId <= 0 || !FileName::isId($key)) {
            return null;
        }
        return $this->tenantDir($tenantId, false) . '/' . $key;
    }

    private function tenantDir(int $tenantId, bool $create): string
    {
        if ($tenantId <= 0) {
            throw new InvalidArgumentException('TENANT_INVALID');
        }
        $dir = $this->root . '/t' . $tenantId;
        if ($create && !is_dir($dir) && !@mkdir($dir, 0750) && !is_dir($dir)) {
            throw new RuntimeException('STORAGE_WRITE_FAILED');
        }
        return $dir;
    }
}
