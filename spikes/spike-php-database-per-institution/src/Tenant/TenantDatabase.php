<?php
declare(strict_types=1);

namespace Spike\TenantDb\Tenant;

use InvalidArgumentException;

/**
 * O banco da instituição da sessão, já conferido. Só o {@see TenantDatabaseResolver} cria um (o construtor é privado
 * para o resto do código): um repositório que recebe um `TenantDatabase` não tem como apontar para o banco de outra
 * instituição, porque ninguém monta um com outro nome.
 */
final class TenantDatabase
{
    private const TABLE = '/^[a-z][a-z0-9_]{0,63}$/';

    private function __construct(public readonly int $tenantId, public readonly string $name)
    {
    }

    /** @internal Só o resolver chama (ele confere a sessão e o estado da instituição antes). */
    public static function trusted(int $tenantId, string $name): self
    {
        if (!TenantDatabaseName::isValid($name)) {
            throw new InvalidArgumentException('DATABASE_NAME_INVALID');
        }
        return new self($tenantId, $name);
    }

    /** A tabela qualificada pelo banco (`banco`.`tabela`), para a conexão única do pedido. */
    public function table(string $table): string
    {
        if (preg_match(self::TABLE, $table) !== 1) {
            throw new InvalidArgumentException('TABLE_NAME_INVALID');
        }
        return "`{$this->name}`.`{$table}`";
    }
}
