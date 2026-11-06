<?php
declare(strict_types=1);

namespace Spike\Cohort\Db;

use PDO;
use RuntimeException;

/**
 * (Mesmo runner do spike-sql-versioned-migrations, US12, com a tabela de controle do spike: cc_schema_migrations.)
 * Aplica, em ordem, só as migrations ainda não registradas. Os spikes do CI dividem o mesmo banco, então este usa
 * tabelas com o prefixo cc_ e as apaga no fim do verify.
 *
 * - As migrations ficam em migrations/<driver>/NNN_descricao.sql (um diretório por dialeto).
 * - A 000 cria schema_migrations com IF NOT EXISTS, então pode sempre rodar primeiro.
 * - Cada arquivo é aplicado e registrado; se um falhar, o processo para ali e o erro sobe.
 *   (No MySQL, DDL faz commit implícito: por isso as migrations são escritas idempotentes.)
 */
final class Migrator
{
    /** @var PDO */
    private $pdo;
    /** @var string */
    private $dir;

    public function __construct(PDO $pdo, string $migrationsRoot)
    {
        $this->pdo = $pdo;
        $driver = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $this->dir = rtrim($migrationsRoot, '/') . '/' . $driver;
        if (!is_dir($this->dir)) {
            throw new RuntimeException("Sem migrations para o driver {$driver}");
        }
    }

    /** @return array<string, string> versão => arquivo, em ordem */
    public function available(): array
    {
        $files = glob($this->dir . '/[0-9][0-9][0-9]_*.sql') ?: [];
        sort($files, SORT_STRING);
        $out = [];
        foreach ($files as $file) {
            $out[substr(basename($file), 0, 3)] = $file;
        }
        return $out;
    }

    /** @return string[] versões já aplicadas */
    public function applied(): array
    {
        $this->bootstrap();
        $rows = $this->pdo->query('SELECT version FROM cc_schema_migrations ORDER BY version')->fetchAll();
        return array_map(static function (array $r): string { return (string) $r['version']; }, $rows);
    }

    /** @return string[] versões pendentes */
    public function pending(): array
    {
        return array_values(array_diff(array_keys($this->available()), $this->applied()));
    }

    /**
     * @param string|null $upTo a última versão a aplicar (o verify aplica a 001, grava as turmas "de antes" e só depois
     *                          a 002, como na produção)
     * @return string[] versões aplicadas nesta execução
     */
    public function migrate(?string $upTo = null): array
    {
        $done = [];
        foreach ($this->pending() as $version) {
            if ($upTo !== null && $version > $upTo) {
                break;
            }
            $this->run($this->available()[$version]);
            $stmt = $this->pdo->prepare('INSERT INTO cc_schema_migrations (version) VALUES (?)');
            $stmt->execute([$version]);
            $done[] = $version;
        }
        return $done;
    }

    /** Garante a tabela de controle aplicando a 000 (idempotente). */
    private function bootstrap(): void
    {
        $first = $this->available()['000'] ?? null;
        if ($first === null) {
            throw new RuntimeException('Falta a migration 000 (schema_migrations)');
        }
        $this->run($first);
    }

    private function run(string $file): void
    {
        foreach (self::statements((string) file_get_contents($file)) as $sql) {
            $this->pdo->exec($sql);
        }
    }

    /**
     * Separa o arquivo em instruções: remove linhas de comentário (--) e corta em ';' no fim de linha.
     *
     * @return string[]
     */
    public static function statements(string $sql): array
    {
        $lines = array_filter(
            preg_split('/\R/', $sql) ?: [],
            static function (string $l): bool { return strpos(ltrim($l), '--') !== 0; }
        );
        $parts = preg_split('/;\s*$/m', implode("\n", $lines)) ?: [];
        return array_values(array_filter(array_map('trim', $parts), static function (string $s): bool {
            return $s !== '';
        }));
    }
}
