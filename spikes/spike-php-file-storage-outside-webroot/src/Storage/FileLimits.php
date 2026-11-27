<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/**
 * Limites da US62 (decisão do Pablo, 2026-11-13): 20 MB por arquivo e 1 GB por instituição, ajustáveis pelo master da
 * plataforma (como o teto das turmas, ADR-016). O limite do arquivo também precisa caber no upload_max_filesize e no
 * post_max_size do PHP da hospedagem (conferido no cPanel, MultiPHP INI Editor).
 */
final class FileLimits
{
    public const MAX_FILE_BYTES = 20 * 1024 * 1024;
    public const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024;

    public function __construct(public readonly int $maxFileBytes = self::MAX_FILE_BYTES)
    {
    }
}
