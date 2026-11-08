<?php
declare(strict_types=1);

namespace Spike\TenantDb\Tenant;

use RuntimeException;

/** O pedido não pode usar o banco dessa instituição: o código diz por quê (403 ou 503 na API). */
final class TenantAccessDenied extends RuntimeException
{
    public function __construct(public readonly string $apiCode)
    {
        parent::__construct($apiCode);
    }
}
