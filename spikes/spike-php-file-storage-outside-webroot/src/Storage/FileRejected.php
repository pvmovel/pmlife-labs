<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

use RuntimeException;

/** Recusa com o código do contrato e o status HTTP (ex.: TYPE_NOT_ALLOWED 415, QUOTA_EXCEEDED 413). */
final class FileRejected extends RuntimeException
{
    /** @param array<string, int|string> $details */
    public function __construct(public readonly string $errorCode, public readonly int $status, public readonly array $details = [])
    {
        parent::__construct($errorCode);
    }
}
