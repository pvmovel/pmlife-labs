<?php
declare(strict_types=1);

// Monta o serviço a partir de uma configuração (no PMLife, o env do ambiente, fora do webroot).
require_once __DIR__ . '/bootstrap.php';

use Spike\Files\Db\ConnectionFactory;
use Spike\Files\Http\FilesApi;
use Spike\Files\Storage\FileLimits;
use Spike\Files\Storage\FileService;
use Spike\Files\Storage\LocalDiskStorage;
use Spike\Files\Storage\PdoFileRepository;
use Spike\Files\Storage\PdoQuotaStore;

/** @param array<string, mixed> $config FILES_ROOT (fora do webroot), WEBROOT (para a recusa) e o banco */
function spike_files_service(PDO $pdo, array $config): FileService
{
    return new FileService(
        new LocalDiskStorage((string) $config['FILES_ROOT'], isset($config['WEBROOT']) ? (string) $config['WEBROOT'] : null),
        new PdoFileRepository($pdo),
        new PdoQuotaStore($pdo),
        new FileLimits((int) ($config['MAX_FILE_BYTES'] ?? FileLimits::MAX_FILE_BYTES)),
    );
}

/** @param array<string, mixed> $config */
function spike_files_api(array $config): FilesApi
{
    return new FilesApi(spike_files_service(ConnectionFactory::create($config), $config));
}

/** @return array<string, mixed> */
function spike_files_config_from_env(): array
{
    $config = [];
    foreach (['DB_DRIVER', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'FILES_ROOT', 'WEBROOT', 'MAX_FILE_BYTES'] as $k) {
        $v = getenv('SPIKE_' . $k);
        if ($v !== false) {
            $config[$k] = $v;
        }
    }
    return $config;
}
