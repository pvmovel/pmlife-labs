<?php
declare(strict_types=1);

// Prova os cenários do spike em cada banco configurado por variáveis de ambiente:
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script
// apaga as tabelas notes e schema_migrations do banco informado; use um banco de teste.

require_once dirname(__DIR__) . '/src/ConnectionFactory.php';
require_once dirname(__DIR__) . '/src/Migrator.php';
require_once dirname(__DIR__) . '/src/PdoNoteRepository.php';

$root = dirname(__DIR__);
$failed = false;

function check(bool $ok, string $label): void
{
    global $failed;
    echo ($ok ? '✅ ' : '❌ ') . $label . "\n";
    if (!$ok) {
        $failed = true;
    }
}

function count_rows(PDO $pdo, string $table): int
{
    return (int) $pdo->query("SELECT COUNT(*) AS n FROM {$table}")->fetch()['n'];
}

function reset_db(PDO $pdo): void
{
    $pdo->exec('DROP TABLE IF EXISTS notes');
    $pdo->exec('DROP TABLE IF EXISTS schema_migrations');
}

$targets = [];
foreach (['mysql' => 'MySQL', 'pgsql' => 'PostgreSQL'] as $driver => $label) {
    $prefix = 'SPIKE_' . strtoupper($driver) . '_';
    if (getenv($prefix . 'HOST') === false) {
        continue;
    }
    $targets[$label] = [
        'DB_DRIVER' => $driver,
        'DB_HOST' => getenv($prefix . 'HOST'),
        'DB_PORT' => (int) getenv($prefix . 'PORT'),
        'DB_NAME' => getenv($prefix . 'DB'),
        'DB_USER' => getenv($prefix . 'USER'),
        'DB_PASS' => (string) getenv($prefix . 'PASS'),
    ];
}

if ($targets === []) {
    if (getenv('CI') !== false) {
        echo "❌ Nenhum banco configurado no CI (SPIKE_MYSQL_* / SPIKE_PGSQL_*)\n";
        exit(1);
    }
    echo "⚠️  Nenhum banco configurado: defina SPIKE_MYSQL_* e/ou SPIKE_PGSQL_* (veja o README). Pulando.\n";
    exit(0);
}

// Cenário: troca de driver isolada (nenhum DSN ou driver fixo fora da ConnectionFactory).
foreach (['NoteRepository.php', 'PdoNoteRepository.php', 'Migrator.php'] as $file) {
    $code = (string) file_get_contents("{$root}/src/{$file}");
    check(preg_match('/mysql:|pgsql:|[\'"](mysql|pgsql)[\'"]/', $code) === 0, "{$file} sem DSN nem nome de driver fixo");
}

$titlesByDb = [];
foreach ($targets as $label => $config) {
    $pdo = ConnectionFactory::create($config);
    $version = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    echo "\n— {$label} {$version} —\n";

    // Cenário: banco novo.
    reset_db($pdo);
    $migrator = new Migrator($pdo, "{$root}/migrations");
    $applied = $migrator->migrate();
    check($applied === ['000', '001', '002'], 'banco novo: aplica 000, 001 e 002 em ordem (' . implode(', ', $applied) . ')');
    check(count_rows($pdo, 'schema_migrations') === 3, 'schema_migrations registra 3 versões');
    check(count_rows($pdo, 'notes') === 2, 'seed inseriu 2 notas');

    // Cenário: rodar de novo não muda nada.
    $again = $migrator->migrate();
    check($again === [] && $migrator->pending() === [], 'segunda execução: nada pendente, nada aplicado');
    check(count_rows($pdo, 'notes') === 2, 'segunda execução: seed não duplicou');

    // Repositório: mesmo código PHP, só o DSN mudou.
    $notes = (new PdoNoteRepository($pdo))->findAll();
    $titlesByDb[$label] = array_column($notes, 'title');
    check(count($notes) === 2 && is_int($notes[0]['id']), 'PdoNoteRepository lê as notas (' . implode(' | ', $titlesByDb[$label]) . ')');

    // Cenário: tabela criada antes do versionamento (como em homolog/prod), com dados.
    reset_db($pdo);
    foreach (Migrator::statements((string) file_get_contents(array_values($migrator->available())[1])) as $sql) {
        $pdo->exec($sql);
    }
    $pdo->exec("INSERT INTO notes (title) VALUES ('Nota antiga')");
    $pdo->exec("INSERT INTO notes (title) VALUES ('Primeira nota')");
    $applied = (new Migrator($pdo, "{$root}/migrations"))->migrate();
    $titles = array_column((new PdoNoteRepository($pdo))->findAll(), 'title');
    check($applied === ['000', '001', '002'], 'tabela pré-existente: as 3 versões são registradas sem erro');
    check($titles === ['Nota antiga', 'Primeira nota', 'Segunda nota'], 'tabela pré-existente: dados preservados e seed sem duplicar (' . implode(' | ', $titles) . ')');

    reset_db($pdo);
}

if (count($titlesByDb) > 1) {
    echo "\n";
    check(count(array_unique(array_map('serialize', $titlesByDb))) === 1, 'MySQL e PostgreSQL devolvem o mesmo resultado pelo mesmo repositório');
}

exit($failed ? 1 : 0);
