<?php
declare(strict_types=1);

namespace Spike\Admin\Tenant;

/**
 * A instituição em foco num pedido. Só dois lugares criam isto: a sessão (a instituição em que a pessoa entrou) e o
 * PlatformService::scope(), que só o master da plataforma alcança. Nunca vem do corpo nem da URL sem passar por um
 * deles. (No pmlife de hoje, o TenantScopedRepository recebe o TenantContext; o PR 1 extrai dele este escopo.)
 */
final class TenantScope
{
    public function __construct(public readonly int $tenantId, public readonly string $slug = '')
    {
    }
}
