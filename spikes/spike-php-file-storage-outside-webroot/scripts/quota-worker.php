<?php
declare(strict_types=1);

// Um envio concorrente (só para o verify.php): espera o mesmo instante dos outros processos e tenta reservar.
//   php quota-worker.php '<config JSON>' <tenant> <bytes> <início em microtime>
require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Files\Db\ConnectionFactory;
use Spike\Files\Storage\PdoQuotaStore;

[, $config, $tenant, $bytes, $start] = $argv;
$store = new PdoQuotaStore(ConnectionFactory::create((array) json_decode($config, true)));
while (microtime(true) < (float) $start) {
    usleep(200);
}
echo $store->reserve((int) $tenant, (int) $bytes) ? 'ok' : 'full';
