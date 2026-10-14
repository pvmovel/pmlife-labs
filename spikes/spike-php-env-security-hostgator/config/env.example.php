<?php
/**
 * Modelo versionado do arquivo de ambiente (valores FICTÍCIOS).
 *
 * Copie para FORA do webroot com o nome `labs.<env>.env.php`
 * (env = development | homolog | production) e permissão 600:
 *
 *   /home<N>/<conta>/labs.production.env.php
 *   /home<N>/<conta>/public_html/   <- webroot, nunca coloque o env aqui
 */
return [
    'DB_DRIVER' => 'mysql',            // mysql | pgsql
    'DB_HOST' => 'localhost',
    // 'DB_PORT' => 3306,              // opcional: só se não for a porta padrão
    'DB_NAME' => 'example_db',
    'DB_USER' => 'example_user',
    'DB_PASS' => 'change-me',
    'ALLOWED_ORIGINS' => [],           // vazio = mesma origem, sem CORS
];
