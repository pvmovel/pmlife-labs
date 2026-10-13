<?php
/**
 * Modelo de configuração (valores FICTÍCIOS), no mesmo formato do arquivo de ambiente
 * do spike de credenciais fora do webroot. Trocar de banco = trocar este arquivo.
 */
return [
    'DB_DRIVER' => 'mysql',          // mysql | pgsql
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => 3306,               // 5432 no pgsql
    'DB_NAME' => 'example_db',
    'DB_USER' => 'example_user',
    'DB_PASS' => 'change-me',
];
