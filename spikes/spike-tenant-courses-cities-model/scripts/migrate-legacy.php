<?php
declare(strict_types=1);

// Converte a trilha legacy/<id>/ (formato de hoje: 5 arquivos e os textos do app) no curso-modelo do ADR-012 e
// imprime o documento. Uso: php scripts/migrate-legacy.php campus-demo > platform/courses/campus-demo/v1.json
// O verify confere que o v1.json no repositório é exatamente o que esta migração gera.

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Spike\Courses\Content\DocumentValidator;
use Spike\Courses\Content\LegacyTrackMigration;

function spike_migrate_legacy(string $dir): array
{
    $read = static fn (string $name): array => json_decode((string) file_get_contents("{$dir}/{$name}.json"), true, 32, JSON_THROW_ON_ERROR);
    $files = [];
    foreach (['buildings', 'interiors', 'levels', 'quests', 'npcs'] as $name) {
        $files[$name] = $read($name);
    }
    return LegacyTrackMigration::migrate($files, $read('locales'), $read('new-texts'), 'course.title');
}

if (realpath($argv[0] ?? '') === __FILE__) {
    $id = $argv[1] ?? '';
    if (preg_match('/^[a-z][a-z0-9-]{1,39}$/', $id) !== 1) {
        fwrite(STDERR, "uso: php scripts/migrate-legacy.php <id da trilha>\n");
        exit(2);
    }
    $course = spike_migrate_legacy(dirname(__DIR__) . "/legacy/{$id}");
    $problems = DocumentValidator::validate($course);
    if ($problems !== []) {
        fwrite(STDERR, implode("\n", array_map(static fn ($p) => $p->key(), $problems)) . "\n");
        exit(1);
    }
    echo json_encode($course, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), "\n";
}
