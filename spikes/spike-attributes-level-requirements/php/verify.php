<?php
declare(strict_types=1);

// Prova o lado do servidor: os mesmos casos de conformidade do TypeScript (cases/*.json) e, em cada banco configurado
// por variáveis de ambiente, a migration das conclusões sem perder linhas e a sincronização gravando a versão.
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script apaga as tabelas do spike no banco
// informado; use um banco de teste. Dados 100% fictícios.

require_once __DIR__ . '/src/Progression.php';
require_once __DIR__ . '/src/ProgressService.php';

use Spike\Progression\CourseProgress;
use Spike\Progression\Institution;
use Spike\Progression\OfflineSync;
use Spike\Progression\PdoCompletionStore;
use Spike\Progression\ProgressService;

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

/** Ordena as chaves dos objetos (a comparação não depende da ordem em que cada lado monta o mapa). */
function canon(mixed $v): mixed
{
    if (!is_array($v)) {
        return $v;
    }
    $v = array_map('canon', $v);
    if (!array_is_list($v)) {
        ksort($v);
    }
    return $v;
}

function doc(string $course, int $version): array
{
    global $root;
    return json_decode((string) file_get_contents("{$root}/src/Content/{$course}/v{$version}.json"), true, 64, JSON_THROW_ON_ERROR);
}

/** @param list<int> $versions */
function history(string $course, array $versions, ?array $levels = null): array
{
    $out = [];
    foreach ($versions as $v) {
        $out[$v] = doc($course, $v);
    }
    if ($levels !== null) {
        $out[max($versions)]['levels'] = $levels;
    }
    return $out;
}

/** O resultado de um caso, no formato do `expect` (o mesmo de src/tests/conformance.ts). */
function evaluate(array $case): array
{
    $progress = new CourseProgress(history($case['course'], $case['versions'], $case['levels'] ?? null), $case['completions']);
    $attempts = [];
    foreach ($case['attempts'] as $questId) {
        $a = $progress->attempt($questId);
        if ($a['ok']) {
            $progress = $progress->with($a['completion']);
            $attempts[] = "{$questId}@{$a['completion']['version']}";
        } else {
            $attempts[] = "{$questId}!{$a['code']}";
        }
    }
    return result($progress, $attempts);
}

function result(CourseProgress $progress, array $attempts = []): array
{
    $level = $progress->level();
    return [
        'attempts' => $attempts,
        'xp' => $progress->xp(),
        'attributes' => $progress->attributes(),
        'level' => $level['current']['id'],
        'next' => $level['next'] === null ? null : ['level' => $level['next']['level']['id'], 'missing' => $level['next']['missing']],
        'phases' => $progress->phases(),
    ];
}

$done = static fn (string ...$ids): array => array_map(static fn (string $q) => ['questId' => $q, 'version' => 1], $ids);

echo "== Casos de conformidade (os mesmos do TypeScript) ==\n";
$files = glob("{$root}/cases/*.json") ?: [];
sort($files);
check(count($files) >= 10, count($files) . ' casos encontrados');
foreach ($files as $file) {
    $case = json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
    $actual = evaluate($case);
    $ok = json_encode(canon($actual)) === json_encode(canon($case['expect']));
    check($ok, basename($file, '.json') . (isset($case['gherkin']) ? " (Gherkin \"{$case['gherkin']}\")" : ''));
    if (!$ok) {
        echo '   esperado: ' . json_encode(canon($case['expect']), JSON_UNESCAPED_UNICODE) . "\n";
        echo '   obtido:   ' . json_encode(canon($actual), JSON_UNESCAPED_UNICODE) . "\n";
    }
}

echo "\n== Regras da instituição ==\n";
$institution = json_decode((string) file_get_contents("{$root}/src/Content/institution.json"), true, 64, JSON_THROW_ON_ERROR);
check(Institution::checkAttributes(doc('astro-demo', 2), $institution['attributes']) === [], 'o curso usa só atributos do catálogo');
$bad = doc('astro-demo', 2);
$bad['attributes'] = ['calculo', 'astrologia'];
check(Institution::checkAttributes($bad, $institution['attributes']) === [['code' => 'ATTRIBUTE_NOT_IN_CATALOG', 'path' => '/attributes/1']], 'atributo fora do catálogo: ATTRIBUTE_NOT_IN_CATALOG@/attributes/1');
$total = Institution::total([
    new CourseProgress(history('astro-demo', [1]), $done('q-telescopio', 'q-orbitas')),
    new CourseProgress(history('clima-demo', [1]), $done('q-previsao')),
]);
check(canon($total) === canon(['xp' => 7000, 'attributes' => ['calculo' => 35, 'observacao' => 20, 'comunicacao' => 10]]), 'total na instituição: 7000 XP, cálculo 35 (dos dois cursos)');
$v12 = history('astro-demo', [1, 2]);
$students = [
    'ana' => new CourseProgress($v12, [...$done('q-telescopio', 'q-orbitas', 'q-diario'), ['questId' => 'q-cometas', 'version' => 2]]),
    'bia' => new CourseProgress($v12, $done('q-telescopio', 'q-orbitas', 'q-diario', 'q-cometas', 'q-eclipse')),
    'caio' => new CourseProgress($v12, []),
];
check(Institution::publishImpact($v12, doc('astro-demo', 3), $students) === [['student' => 'ana', 'from' => 'Observador', 'to' => 'Aprendiz']], 'antes de publicar a v3 (cálculo ≥ 35), o admin vê que a ana cairia de Observador para Aprendiz');

$v1 = doc('astro-demo', 1);
$without = [1 => $v1, 2 => [...$v1, 'phases' => array_values(array_filter($v1['phases'], static fn (array $p) => $p['id'] !== 'fase-2'))]];
$p = new CourseProgress($without, $done('q-telescopio', 'q-orbitas', 'q-diario', 'q-cometas'));
check(array_map(static fn (array $x) => "{$x['id']}:{$x['status']}@{$x['version']}", $p->phases()) === ['fase-1:concluded@1', 'fase-3:locked@2', 'fase-2:in-progress@1']
    && $p->attempt('q-eclipse') === ['ok' => true, 'completion' => ['questId' => 'q-eclipse', 'version' => 1]], 'a versão nova tirou a fase 2 em andamento: o aluno a termina na v1');

echo "\n== Fila offline (o servidor decide a versão) ==\n";
$sync = OfflineSync::applyQueue(new CourseProgress($v12, []), ['q-mapa-ceu', 'q-diario']);
check($sync['rejected'] === [['questId' => 'q-diario', 'code' => 'QUEST_UNKNOWN']] && $sync['progress']->phaseVersion('fase-1') === 2, 'o primeiro a chegar fixa a versão da fase (v2); a missão que só existia na v1 é recusada');

$databases = [];
foreach (['mysql' => 'SPIKE_MYSQL', 'pgsql' => 'SPIKE_PGSQL'] as $driver => $prefix) {
    if (getenv("{$prefix}_HOST")) {
        $databases[$driver] = $prefix;
    }
}
if ($databases === []) {
    echo "\n⚠️  Nenhum banco configurado (SPIKE_MYSQL_* / SPIKE_PGSQL_*): a migration não foi testada.\n";
}

foreach ($databases as $driver => $prefix) {
    $port = getenv("{$prefix}_PORT") ?: ($driver === 'mysql' ? '3306' : '5432');
    $dsn = $driver === 'mysql'
        ? 'mysql:host=' . getenv("{$prefix}_HOST") . ";port={$port};dbname=" . getenv("{$prefix}_DB") . ';charset=utf8mb4'
        : 'pgsql:host=' . getenv("{$prefix}_HOST") . ";port={$port};dbname=" . getenv("{$prefix}_DB");
    $pdo = new PDO($dsn, (string) getenv("{$prefix}_USER"), (string) getenv("{$prefix}_PASS"), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $server = (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    echo "\n== {$driver} {$server} ==\n";
    $pdo->exec('DROP TABLE IF EXISTS quest_completions');
    $pdo->exec('DROP TABLE IF EXISTS schema_migrations');

    $apply = static function (string $file) use ($pdo, $root, $driver): void {
        $lines = array_filter(preg_split('/\R/', (string) file_get_contents("{$root}/migrations/{$driver}/{$file}")) ?: [], static fn (string $l) => !str_starts_with(ltrim($l), '--'));
        foreach (preg_split('/;\s*$/m', implode("\n", $lines)) ?: [] as $sql) {
            if (trim($sql) !== '') {
                $pdo->exec($sql);
            }
        }
    };
    $apply('000_create_schema_migrations.sql');
    $apply('001_create_quest_completions.sql');

    // O banco de hoje: duas instituições, conclusões sem versão.
    $legacy = $pdo->prepare('INSERT INTO quest_completions (tenant_id, user_id, track_id, quest_id, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $rows = [[1, 10, 'astro-demo', 'q-telescopio'], [1, 10, 'astro-demo', 'q-orbitas'], [1, 11, 'astro-demo', 'q-telescopio'], [2, 10, 'astro-demo', 'q-diario']];
    foreach ($rows as $i => $r) {
        $at = sprintf('2026-10-01 10:00:%02d', $i);
        $legacy->execute([...$r, $at, $at]);
    }
    $before = $pdo->query('SELECT tenant_id, user_id, track_id, quest_id, completed_at FROM quest_completions ORDER BY 1, 2, 3, 4')->fetchAll(PDO::FETCH_NUM);

    $apply('002_add_course_version.sql');
    $apply('002_add_course_version.sql');
    $after = $pdo->query('SELECT tenant_id, user_id, track_id, quest_id, completed_at FROM quest_completions ORDER BY 1, 2, 3, 4')->fetchAll(PDO::FETCH_NUM);
    check($before === $after && count($after) === 4, 'a 002 roda duas vezes sem erro e as 4 linhas de hoje continuam iguais');
    check((int) $pdo->query('SELECT COUNT(*) FROM quest_completions WHERE course_version = 1')->fetchColumn() === 4, 'as linhas de hoje ficam na versão 1');
    $default = $pdo->query("SELECT column_default FROM information_schema.columns WHERE table_name = 'quest_completions' AND column_name = 'course_version'" . ($driver === 'mysql' ? ' AND table_schema = DATABASE()' : ''))->fetchColumn();
    check($default === null, 'sem DEFAULT depois da migração: toda conclusão nova diz a versão');
    check((int) $pdo->query("SELECT COUNT(*) FROM schema_migrations WHERE version IN ('001', '002')")->fetchColumn() === 2, 'schema_migrations registra 001 e 002 uma vez cada');

    // Gherkin "Versão nova no meio da fase", agora com o banco: o aluno 10 da instituição 1 está no meio da fase 1 (v1).
    $service = new ProgressService(new PdoCompletionStore($pdo));
    $r = $service->sync(1, 10, $v12, ['q-mapa-ceu', 'q-diario', 'q-cometas'], '2026-10-30 09:00:00');
    check($r['accepted'] === [['questId' => 'q-diario', 'version' => 1], ['questId' => 'q-cometas', 'version' => 2]], 'termina a fase 1 na v1 e entra na fase 2 na v2');
    $stored = new CourseProgress($v12, (new PdoCompletionStore($pdo))->completions(1, 10, 'astro-demo'));
    $case003 = json_decode((string) file_get_contents("{$root}/cases/003-versao-nova-no-meio-da-fase.json"), true, 64, JSON_THROW_ON_ERROR);
    $expected = $case003['expect'];
    $expected['attempts'] = [];
    check(json_encode(canon(result($stored))) === json_encode(canon($expected)), 'lido do banco, o progresso é o do caso 003 (9000 XP, Observador, fase 1 na v1, fase 2 na v2)');
    $again = $service->sync(1, 10, $v12, ['q-diario', 'q-cometas'], '2026-10-30 09:05:00');
    check($again['accepted'] === [] && array_column($again['rejected'], 'code') === ['ALREADY_COMPLETED', 'ALREADY_COMPLETED'], 'a mesma fila de novo (outro aparelho) não grava nada');
    check((new PdoCompletionStore($pdo))->completions(2, 10, 'astro-demo') === [['questId' => 'q-diario', 'version' => 1]], 'a outra instituição não vê as conclusões da primeira (filtro por tenant_id)');
}

echo $failed ? "\n❌ Falhou.\n" : "\n✅ Tudo certo.\n";
exit($failed ? 1 : 0);
