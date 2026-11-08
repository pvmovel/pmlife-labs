<?php
declare(strict_types=1);

namespace Spike\TenantDb\Tenant;

use InvalidArgumentException;

/**
 * O nome do banco de uma instituição: `<prefixo da conta>_<ambiente><id da instituição>`, com o id em 4 dígitos.
 * Exemplos: `conta_pml0001` (produção) e `conta_pmlh0001` (homolog).
 *
 * - O prefixo é o da conta da hospedagem: o cPanel prefixa todo banco com `<usuário>_`, e o usuário do cPanel não tem
 *   `_`. Ele sai do nome do banco da plataforma, que já está no arquivo de ambiente. Nada novo no env.
 * - O ambiente vem do host (ou do `APP_ENV` do Cron), o mesmo que escolhe o arquivo de ambiente: produção e homolog
 *   nunca apontam para o mesmo banco.
 * - Ninguém digita o nome: o admin só mostra qual banco criar no cPanel. Um erro de digitação não aponta para o banco
 *   de outra instituição ou de outro ambiente.
 */
final class TenantDatabaseName
{
    /** O código de cada ambiente no nome. */
    public const ENVIRONMENTS = ['production' => 'pml', 'homolog' => 'pmlh', 'development' => 'pmld'];
    /** O MySQL aceita até 64 caracteres num nome de banco. */
    private const MAX = 64;
    private const PREFIX = '/^[a-z][a-z0-9]{0,15}$/';

    /**
     * O prefixo da conta, pelo nome do banco da plataforma (`conta_pmlife` ➔ `conta`). Sem `_`, não há prefixo (o
     * MySQL local, sem cPanel).
     */
    public static function accountPrefix(string $platformDatabase): ?string
    {
        $cut = strpos($platformDatabase, '_');
        if ($cut === false) {
            return null;
        }
        $prefix = substr($platformDatabase, 0, $cut);
        if (preg_match(self::PREFIX, $prefix) !== 1) {
            throw new InvalidArgumentException('ACCOUNT_PREFIX_INVALID');
        }
        return $prefix;
    }

    /** O nome do banco da instituição no ambiente. */
    public static function for(string $platformDatabase, string $environment, int $tenantId): string
    {
        $code = self::ENVIRONMENTS[$environment] ?? throw new InvalidArgumentException('ENVIRONMENT_UNKNOWN');
        if ($tenantId < 1 || $tenantId > 99_999_999) {
            throw new InvalidArgumentException('TENANT_ID_INVALID');
        }
        $prefix = self::accountPrefix($platformDatabase);
        $name = ($prefix === null ? '' : "{$prefix}_") . $code . str_pad((string) $tenantId, 4, '0', STR_PAD_LEFT);
        if (strlen($name) > self::MAX) {
            throw new InvalidArgumentException('DATABASE_NAME_TOO_LONG');
        }
        return $name;
    }

    /** Um nome que esta regra gera (o único que a fábrica de repositórios aceita). */
    public static function isValid(string $name): bool
    {
        return strlen($name) <= self::MAX && preg_match('/^(?:[a-z][a-z0-9]{0,15}_)?pml[hd]?\d{4,8}$/', $name) === 1;
    }
}
