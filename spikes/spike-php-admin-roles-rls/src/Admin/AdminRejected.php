<?php
declare(strict_types=1);

namespace Spike\Admin\Admin;

use RuntimeException;

/** Um pedido do admin recusado: o status HTTP, o código do contrato e, num formulário, o erro de cada campo. */
final class AdminRejected extends RuntimeException
{
    /** @param array<string, string> $fields campo => código */
    public function __construct(public readonly int $status, public readonly string $reason, public readonly array $fields = [])
    {
        parent::__construct($reason);
    }
}
