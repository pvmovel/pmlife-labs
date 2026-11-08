<?php
declare(strict_types=1);

namespace Spike\TenantDb\Db;

use PDO;

/**
 * A única conexão do pedido: o usuário do site no banco da plataforma. Os bancos das instituições são lidos pela mesma
 * conexão, com as tabelas qualificadas (`banco`.`tabela`), porque a hospedagem compartilhada limita as conexões
 * simultâneas da conta (25 na revenda, divididas entre produção, homolog e labs).
 */
final class ConnectionFactory
{
    /** @param array{host: string, port: int, db: string, user: string, pass: string} $config */
    public static function create(array $config): LoggingPdo
    {
        $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['db']};charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        return new LoggingPdo($dsn, $config['user'], $config['pass'], $options);
    }
}
