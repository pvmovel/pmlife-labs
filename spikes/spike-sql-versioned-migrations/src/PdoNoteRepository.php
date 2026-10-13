<?php
declare(strict_types=1);

require_once __DIR__ . '/NoteRepository.php';

/**
 * Implementação PDO com SQL portável (funciona igual em MySQL e PostgreSQL).
 * Não contém DSN nem nome de driver: recebe o PDO pronto da ConnectionFactory.
 */
final class PdoNoteRepository implements NoteRepository
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function findAll(): array
    {
        $rows = $this->pdo->query('SELECT id, title FROM notes ORDER BY id')->fetchAll();
        return array_map(static function (array $r): array {
            return ['id' => (int) $r['id'], 'title' => (string) $r['title']];
        }, $rows);
    }
}
