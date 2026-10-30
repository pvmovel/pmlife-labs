<?php
declare(strict_types=1);

namespace Spike\Courses\Tenant;

use LogicException;
use PDO;
use PDOStatement;

/**
 * (Mesma base do spike-php-session-auth-multitenant.) O MySQL 5.7 não tem Row Level Security: o isolamento é imposto
 * aqui, num lugar só. Todo SQL precisa do filtro "tenant_id = :tenant_id" (num INSERT, a coluna tenant_id recebendo
 * :tenant_id), e o :tenant_id vem da sessão. No PostgreSQL, o construtor também informa a instituição ao banco
 * (app.tenant_id), e o RLS vira a segunda barreira.
 */
abstract class TenantScopedRepository
{
    private const FILTER = '/\btenant_id\s*=\s*:tenant_id\b/';
    private const INSERT = '/^\s*INSERT\s+INTO\s+\w+\s*\(\s*tenant_id\s*,.*\bVALUES\s*\(\s*:tenant_id\s*,/is';

    public function __construct(protected readonly PDO $pdo, protected readonly TenantContext $tenant)
    {
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql') {
            $pdo->prepare("SELECT set_config('app.tenant_id', ?, false)")->execute([(string) $tenant->tenantId]);
        }
    }

    /** @param array<string, scalar|null> $params */
    protected function run(string $sql, array $params = []): PDOStatement
    {
        if (!preg_match(self::FILTER, $sql) && !preg_match(self::INSERT, $sql)) {
            throw new LogicException('SQL sem o filtro "tenant_id = :tenant_id" num repositório com escopo de tenant');
        }
        if (array_key_exists('tenant_id', $params)) {
            throw new LogicException('O tenant_id vem da sessão; não pode ser passado por quem chama');
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(['tenant_id' => $this->tenant->tenantId] + $params);
        return $stmt;
    }
}
