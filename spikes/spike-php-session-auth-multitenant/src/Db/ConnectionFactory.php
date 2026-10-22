<?php
declare(strict_types=1);

namespace Spike\Auth\Db;

use PDO;
use RuntimeException;

/**
 * (Mesma fábrica do spike-sql-versioned-migrations, US12.)
 * Único lugar que conhece driver e DSN. Controllers, repositórios e o Migrator recebem
 * um PDO pronto: trocar MySQL por PostgreSQL é trocar a configuração, não o código.
 */
final class ConnectionFactory
{
    /** @param array<string, mixed> $config */
    public static function create(array $config): PDO
    {
        $driver = (string) ($config['DB_DRIVER'] ?? 'mysql');
        $host = (string) ($config['DB_HOST'] ?? '127.0.0.1');
        $name = (string) ($config['DB_NAME'] ?? '');

        switch ($driver) {
            case 'mysql':
                $port = (int) ($config['DB_PORT'] ?? 3306);
                $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
                break;
            case 'pgsql':
                $port = (int) ($config['DB_PORT'] ?? 5432);
                $dsn = "pgsql:host={$host};port={$port};dbname={$name}";
                break;
            default:
                throw new RuntimeException('DB_DRIVER_UNSUPPORTED');
        }

        return new PDO($dsn, (string) ($config['DB_USER'] ?? ''), (string) ($config['DB_PASS'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
