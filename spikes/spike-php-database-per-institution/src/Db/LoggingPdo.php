<?php
declare(strict_types=1);

namespace Spike\TenantDb\Db;

use PDO;
use PDOStatement;

/**
 * Um PDO que anota cada SQL enviado. Só para a prova do spike: o Gherkin "Isolamento entre bancos" pede que o
 * servidor recuse "sem abrir o banco da Aurora", e o registro mostra que nenhum SQL citou o banco dela.
 */
final class LoggingPdo extends PDO
{
    /** @var list<string> */
    public array $log = [];

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $this->log[] = $query;
        return parent::prepare($query, $options);
    }

    public function exec(string $statement): int|false
    {
        $this->log[] = $statement;
        return parent::exec($statement);
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $this->log[] = $query;
        return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs);
    }
}
