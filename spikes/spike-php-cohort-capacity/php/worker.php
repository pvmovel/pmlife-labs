<?php
declare(strict_types=1);

// Uma matrícula num processo próprio, para o verify provocar duas ao mesmo tempo (a última vaga). Os dois processos
// esperam o mesmo instante (start) e então matriculam; o hold segura a transação entre ler as vagas e gravar.
// Uso: php worker.php <mysql|pgsql> <tenantId> <courseId> <userId> <lock 0|1> <holdMs> <start (microtime)> <now>
// Imprime a turma (slug) ou "ERRO <mensagem>". Dados 100% fictícios.

require_once __DIR__ . '/src/bootstrap.php';

use Spike\Cohort\CohortEnrollment;
use Spike\Cohort\Db\ConnectionFactory;

[, $driver, $tenantId, $courseId, $userId, $lock, $holdMs, $start, $now] = $argv;
$prefix = $driver === 'pgsql' ? 'SPIKE_PGSQL_' : 'SPIKE_MYSQL_';
$pdo = ConnectionFactory::create([
    'DB_DRIVER' => $driver,
    'DB_HOST' => getenv($prefix . 'HOST'),
    'DB_PORT' => getenv($prefix . 'PORT'),
    'DB_NAME' => getenv($prefix . 'DB'),
    'DB_USER' => getenv($prefix . 'USER'),
    'DB_PASS' => getenv($prefix . 'PASS'),
]);
$wait = (float) $start - microtime(true);
if ($wait > 0) {
    usleep((int) ($wait * 1_000_000));
}
try {
    echo (new CohortEnrollment($pdo, (int) $tenantId))->enroll((int) $userId, $courseId, $now, $lock === '1', (int) $holdMs);
} catch (Throwable $e) {
    echo 'ERRO ' . $e->getMessage();
}
