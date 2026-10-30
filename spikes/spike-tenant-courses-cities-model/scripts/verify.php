<?php
declare(strict_types=1);

// Prova o spike: regras puras (sempre) e, em cada banco configurado por variáveis de ambiente, os cenários do Gherkin
// da US35, o vínculo com versões do curso-modelo, a cópia, o RLS do PostgreSQL, publicações em paralelo e um ponta a
// ponta HTTP de verdade (php -S).
//   SPIKE_MYSQL_HOST/PORT/DB/USER/PASS  e  SPIKE_PGSQL_HOST/PORT/DB/USER/PASS
// No CI do labs os dois bancos sobem como service containers. ATENÇÃO: o script apaga as tabelas do spike no banco
// informado; use um banco de teste. Dados 100% fictícios.

require_once dirname(__DIR__) . '/src/factory.php';
require_once __DIR__ . '/migrate-legacy.php';

use Spike\Courses\Content\CourseId;
use Spike\Courses\Content\DocumentValidator;
use Spike\Courses\Content\Json;
use Spike\Courses\Content\Overlay;
use Spike\Courses\Content\Problem;
use Spike\Courses\Courses\PublishRejected;
use Spike\Courses\Db\ConnectionFactory;
use Spike\Courses\Db\Migrator;
use Spike\Courses\Tenant\TenantContext;
use Spike\Courses\Tenant\TenantScopedRepository;

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

/** @param list<Problem> $problems */
function keys(array $problems): array
{
    $k = array_map(static fn (Problem $p): string => $p->key(), $problems);
    sort($k);
    return $k;
}

/** Aplica as mutações de um caso de conformidade (set, remove e copy, em JSON Pointer; "-" acrescenta no fim). */
function mutate(array $doc, array $mutations): array
{
    foreach ($mutations as $m) {
        $value = $m['op'] === 'copy' ? pointer_get($doc, $m['from']) : ($m['value'] ?? null);
        $segments = array_map(static fn (string $s): string => str_replace(['~1', '~0'], ['/', '~'], $s), array_slice(explode('/', $m['path']), 1));
        $last = array_pop($segments);
        $node = &$doc;
        foreach ($segments as $s) {
            $node = &$node[ctype_digit($s) ? (int) $s : $s];
        }
        if ($m['op'] === 'remove') {
            $wasList = array_is_list($node);
            unset($node[ctype_digit($last) ? (int) $last : $last]);
            if ($wasList) {
                $node = array_values($node);
            }
        } elseif ($last === '-') {
            $node[] = $value;
        } else {
            $node[ctype_digit($last) ? (int) $last : $last] = $value;
        }
        unset($node);
    }
    return $doc;
}

function pointer_get(array $doc, string $path): mixed
{
    foreach (array_slice(explode('/', $path), 1) as $s) {
        $doc = $doc[ctype_digit($s) ? (int) $s : $s];
    }
    return $doc;
}

function has_key(mixed $node, string $key): bool
{
    if (!is_array($node)) {
        return false;
    }
    foreach ($node as $k => $v) {
        if ($k === $key || has_key($v, $key)) {
            return true;
        }
    }
    return false;
}

$read = static fn (string $file): array => Json::decode((string) file_get_contents($file));
$v1 = $read("{$root}/platform/courses/campus-demo/v1.json");
$v2 = $read("{$root}/platform/courses/campus-demo/v2.json");
$hq = $read("{$root}/platform/headquarters/v1.json");
$legacy = static fn (string $name): array => $read("{$root}/legacy/campus-demo/{$name}.json");

// ---------------------------------------------------------------- regras puras (sem banco)
echo "--- migração do formato de hoje para o curso-modelo (Gherkin: progresso preservado)\n";
$migrated = spike_migrate_legacy("{$root}/legacy/campus-demo");
check(Json::encodeArray($migrated) === Json::canonical((string) file_get_contents("{$root}/platform/courses/campus-demo/v1.json")), 'o v1.json do repositório é exatamente o que a migração gera (scripts/migrate-legacy.php)');
check($migrated['courseId'] === $legacy('buildings')['trackId'], 'o id do curso é o id da trilha de hoje (o progresso gravado guarda esse id)');
$oldQuests = array_column($legacy('quests')['quests'], 'rewardXp', 'id');
$newQuests = array_column($migrated['phases'][0]['quests'], 'rewardXp', 'id');
check($newQuests === $oldQuests, 'a fase 1 tem as mesmas missões, com os mesmos ids e o mesmo XP');
check(count($migrated['phases']) === 1 && $migrated['phases'][0]['requires'] === [] && $migrated['phases'][0]['city']['buildings'] === $legacy('buildings')['buildings'], 'a cidade de hoje vira a fase 1, sem pré-requisitos, com os mesmos prédios');
$roles = array_column($migrated['city']['buildings'], 'role');
sort($roles);
check($roles === ['board', 'phases-portal'] && count($migrated['city']['buildings']) === 2, 'a cidade do curso nasce só com os prédios obrigatórios (Portal das fases e Mural)');
check(!isset($migrated['texts']['pt-BR']['hud.menu.open']) && isset($migrated['texts']['en-US']['quests.resumir']), 'só os textos que o curso usa vão para o documento (nada do resto do app)');
$completed = ['ler-o-guia', 'resumir', 'ler-o-guia'];
$xp = static fn (array $rewards): int => array_sum(array_intersect_key($rewards, array_flip(array_unique($completed))));
check($xp($newQuests) === $xp($oldQuests) && $xp($newQuests) === 250, 'um aluno com 2 missões concluídas continua com o mesmo XP (250)');

echo "--- casos de conformidade (cases/, os mesmos que o validador TypeScript roda)\n";
$bases = ['course' => $v1, 'headquarters' => $hq];
$total = 0;
$wrong = [];
foreach (glob("{$root}/cases/*.json") ?: [] as $file) {
    $case = $read($file);
    $total++;
    $doc = mutate($bases[$case['base']], $case['mutations'] ?? []);
    if (array_key_exists('overlay', $case)) {
        [$merged, $problems] = Overlay::apply($doc, $case['overlay']);
        $got = keys($problems);
        $gotMerged = $merged === null ? [] : keys(DocumentValidator::validate($merged));
        $expMerged = $case['expectMerged'];
        sort($expMerged);
    } else {
        $got = keys(DocumentValidator::validate($doc));
        $gotMerged = $expMerged = [];
    }
    $exp = $case['expect'];
    sort($exp);
    if ($got !== $exp || $gotMerged !== $expMerged) {
        $wrong[] = basename($file) . ': esperado ' . json_encode([$exp, $expMerged], JSON_UNESCAPED_SLASHES) . ', veio ' . json_encode([$got, $gotMerged], JSON_UNESCAPED_SLASHES);
    }
}
foreach ($wrong as $w) {
    echo "   {$w}\n";
}
check($total >= 50 && $wrong === [], "{$total} casos (sede, curso, fases, níveis, textos e camada): cada um dá exatamente os problemas esperados, com código e caminho");
check(DocumentValidator::validate($v2) === [], 'a versão 2 do curso-modelo também é válida');

echo "--- camada do vínculo (o que a instituição muda sem tocar no travado)\n";
$cantina = ['id' => 'cantina', 'labelKey' => 'city.buildings.cantina', 'position' => [0, -11], 'size' => [4, 3, 4], 'color' => '#ef4444'];
$cantinaTexts = ['pt-BR' => ['city.buildings.cantina' => 'Cantina'], 'en-US' => ['city.buildings.cantina' => 'Canteen']];
$overlay = ['schema' => 1, 'kind' => 'overlay', 'courseId' => 'campus-demo', 'phases' => ['fase-1' => ['add' => ['buildings' => [$cantina]]]], 'texts' => $cantinaTexts];
[$onV1] = Overlay::apply($v1, $overlay);
[$onV2] = Overlay::apply($v2, $overlay);
check($onV1 !== null && DocumentValidator::validate($onV1) === [], 'a camada com a cantina mescla sem problemas na versão 1');
check($onV2 !== null && keys(DocumentValidator::validate($onV2)) === ['BUILDINGS_OVERLAP@/phases/0/city/buildings/3'], 'na versão 2, o Observatório novo da plataforma cai em cima da cantina: a mescla acusa (e o vínculo fica na versão 1)');
check(array_column($onV1['phases'][0]['quests'], 'rewardXp', 'id') === $newQuests && $onV1['city'] === $v1['city'], 'a mescla mantém tudo o que vem da plataforma (missões travadas e cidade do curso)');
[$empty] = Overlay::apply($v1, Overlay::empty('campus-demo'));
check(Json::encodeArray($empty) === Json::encodeArray($v1), 'sem camada, o curso vinculado é exatamente o curso-modelo');

echo "--- ids e documento\n";
check(CourseId::forTenant('aurora', 'concursos') === 'aurora.concursos' && CourseId::isPlatform('dev-to-pm') && !CourseId::isPlatform('aurora.concursos'), 'id da instituição "<instituição>.<curso>" nunca colide com um da plataforma');
check(CourseId::split('aurora.a.b') === null && CourseId::forTenant('aurora', 'Concursos') === null && CourseId::split('x.concursos') === null, 'ids fora do formato são recusados');
$pretty = json_encode($v1, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
check(Json::canonical($pretty) === Json::encodeArray($v1), 'o mesmo curso com outra formatação tem a mesma forma canônica (o mesmo hash e o mesmo ETag)');

echo "--- tenant\n";
$threw = false;
try {
    new TenantContext(1, 'aurora', 1, 'superuser');
} catch (InvalidArgumentException) {
    $threw = true;
}
check($threw, 'papel fora da lista (student, tenant_admin) é recusado');

// ---------------------------------------------------------------- bancos
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
    echo "⚠️  Nenhum banco configurado: defina SPIKE_MYSQL_* e/ou SPIKE_PGSQL_* (veja o README). Pulando a parte com banco.\n";
    exit($failed ? 1 : 0);
}

const TABLES = ['course_document_versions', 'course_documents', 'course_links', 'tenants', 'schema_migrations'];

/** Os spikes do labs dividem o mesmo banco de teste: as tabelas daqui saem antes e depois (mesmo com erro). */
function reset_db(PDO $pdo): void
{
    $pg = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql';
    if (!$pg) {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    }
    foreach (TABLES as $table) {
        $pdo->exec("DROP TABLE IF EXISTS {$table}" . ($pg ? ' CASCADE' : ''));
    }
    if (!$pg) {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
}

// O catálogo da plataforma numa pasta temporária: a versão 2 do curso-modelo "sai na release" no meio do teste.
$platform = sys_get_temp_dir() . '/spike-courses-platform-' . getmypid();
register_shutdown_function(static function () use ($targets, $platform): void {
    foreach ($targets as $config) {
        try {
            reset_db(ConnectionFactory::create($config));
        } catch (Throwable) {
        }
    }
    array_map('unlink', glob("{$platform}/*/*/*.json") ?: []);
    array_map('unlink', glob("{$platform}/*/*.json") ?: []);
    @rmdir("{$platform}/courses/campus-demo");
    @rmdir("{$platform}/courses");
    @rmdir("{$platform}/headquarters");
    @rmdir($platform);
});

$now = new DateTimeImmutable('2026-10-29T10:00:00Z');

/** @return array{string, list<string>, list<string>} [motivo, problemas, problemas da mescla] */
function rejected(callable $fn): array
{
    try {
        $fn();
    } catch (PublishRejected $e) {
        return [$e->reason, keys($e->problems), keys($e->mergedProblems)];
    }
    return ['', [], []];
}

foreach ($targets as $label => $config) {
    echo "=== {$label}\n";
    $pdo = ConnectionFactory::create($config);
    reset_db($pdo);
    (new Migrator($pdo, $root . '/migrations'))->migrate();
    $pdo->exec("INSERT INTO tenants (slug, name) VALUES ('aurora', 'Escola Aurora (fictícia)'), ('boreal', 'Instituto Boreal (fictício)')");
    $aurora = (int) $pdo->query("SELECT id FROM tenants WHERE slug = 'aurora'")->fetchColumn();
    $boreal = (int) $pdo->query("SELECT id FROM tenants WHERE slug = 'boreal'")->fetchColumn();

    foreach (["{$platform}/headquarters", "{$platform}/courses/campus-demo"] as $dir) {
        @mkdir($dir, 0777, true);
    }
    copy("{$root}/platform/headquarters/v1.json", "{$platform}/headquarters/v1.json");
    copy("{$root}/platform/courses/campus-demo/v1.json", "{$platform}/courses/campus-demo/v1.json");
    @unlink("{$platform}/courses/campus-demo/v2.json");

    $service = static fn (int $tenantId, string $slug, string $role) => spike_course_service($pdo, new TenantContext($tenantId, $slug, $role === 'tenant_admin' ? 10 : 20, $role), $platform);
    $auroraAdmin = $service($aurora, 'aurora', 'tenant_admin');
    $auroraStudent = $service($aurora, 'aurora', 'student');
    $borealAdmin = $service($boreal, 'boreal', 'tenant_admin');
    $borealStudent = $service($boreal, 'boreal', 'student');

    echo "--- Gherkin: sede e cidade do curso\n";
    $h = $auroraStudent->headquarters();
    check($h['source'] === 'platform' && Json::decode($h['content'])['kind'] === 'headquarters', 'antes de publicar a sua, a Aurora já tem uma sede: a padrão da plataforma');
    $ownHq = $hq;
    $ownHq['texts']['pt-BR']['hq.title'] = 'Sede da Aurora';
    $ownHq['texts']['en-US']['hq.title'] = 'Aurora headquarters';
    $r = $auroraAdmin->publish('headquarters', 'sede', Json::encodeArray($ownHq), $now);
    $h = $auroraStudent->headquarters();
    check($r['created'] && $r['version'] === 1 && $h['source'] === 'tenant' && Json::decode($h['content'])['texts']['pt-BR']['hq.title'] === 'Sede da Aurora', 'a Aurora publica a sede dela, e o aluno passa a chegar nela');
    check($borealStudent->headquarters()['source'] === 'platform', 'a sede da Aurora não aparece para a Boreal');
    $r = $auroraAdmin->link('campus-demo', $now);
    check($r['created'] && $r['adoptedVersion'] === 1, 'a Aurora vincula o curso-modelo "campus-demo" (versão 1)');
    $list = $auroraStudent->courses();
    $sedeRoles = array_column(Json::decode($h['content'])['city']['buildings'], 'role');
    $course = $auroraStudent->course('campus-demo');
    $doc = Json::decode($course['content']);
    $cityRoles = array_column($doc['city']['buildings'], 'role');
    $open = array_values(array_filter($doc['phases'], static fn (array $f): bool => $f['requires'] === []));
    check(in_array('courses-portal', $sedeRoles, true) && count($list) === 1 && $list[0]['courseId'] === 'campus-demo' && $list[0]['source'] === 'link', 'pelo Portal dos cursos da sede, o aluno vê o curso vinculado');
    check(in_array('phases-portal', $cityRoles, true) && ($open[0]['id'] ?? null) === 'fase-1', 'na cidade do curso, o Portal das fases leva à fase 1 (aberta, sem pré-requisitos)');
    check($course['content'] === Json::canonical((string) file_get_contents("{$root}/platform/courses/campus-demo/v1.json")), 'sem camada, o aluno recebe exatamente o curso-modelo da versão adotada');

    echo "--- Gherkin: isolamento entre instituições\n";
    $own = $migrated;
    $own['courseId'] = 'aurora.concursos';
    $r = $auroraAdmin->publish('course', 'concursos', Json::encodeArray(mutate($own, [['op' => 'set', 'path' => '/texts/pt-BR/course.title', 'value' => 'Concursos (Aurora)']])), $now);
    check($r['created'] && $r['version'] === 1 && $auroraStudent->course('aurora.concursos') !== null, 'a Aurora cria um curso dela, "aurora.concursos"');
    check($borealStudent->course('aurora.concursos') === null, 'um aluno da Boreal que pede o curso da Aurora recebe "não encontrado"');
    check($borealStudent->course('campus-demo') === null && $borealStudent->courses() === [], 'o curso-modelo sem vínculo também é "não encontrado" na Boreal, e a lista dela está vazia');
    check(rejected(static fn () => $borealAdmin->copy('aurora.concursos', 'roubado', $now))[0] === 'NOT_FOUND', 'a Boreal não consegue copiar o curso da Aurora');

    echo "--- Gherkin: estrutura inválida não é publicada\n";
    $noEnrollment = mutate($ownHq, [['op' => 'remove', 'path' => '/city/buildings/0']]);
    [$why, $problems] = rejected(static fn () => $auroraAdmin->publish('headquarters', 'sede', Json::encodeArray($noEnrollment), $now));
    check($why === 'CONTENT_INVALID' && $problems === ['ROLE_MISSING(enrollment)@/city/buildings'], 'sede sem Matrículas: recusada com ROLE_MISSING(enrollment)@/city/buildings');
    $badQuest = mutate($own, [['op' => 'set', 'path' => '/phases/0/quests/2/buildingId', 'value' => 'predio-x']]);
    [$why, $problems] = rejected(static fn () => $auroraAdmin->publish('course', 'concursos', Json::encodeArray($badQuest), $now));
    check($why === 'CONTENT_INVALID' && in_array('QUEST_BUILDING_UNKNOWN@/phases/0/quests/2/buildingId', $problems, true), 'missão apontando para um prédio inexistente: recusada com o código e o caminho');
    check($auroraStudent->headquarters()['version'] === 1 && $auroraStudent->course('aurora.concursos')['version'] === 1, 'nada recusado vira versão: o aluno continua com as versões válidas');
    check(rejected(static fn () => $auroraStudent->publish('course', 'concursos', Json::encodeArray($own), $now))[0] === 'FORBIDDEN', 'aluno não publica (FORBIDDEN)');
    check(rejected(static fn () => $auroraAdmin->publish('course', 'outro', Json::encodeArray($own), $now))[1] === ['COURSE_ID_MISMATCH@/courseId'], 'o courseId do documento precisa ser o do slug publicado');
    check(rejected(static fn () => $auroraAdmin->publish('headquarters', 'sede', Json::encodeArray($own), $now))[1] === ['KIND_MISMATCH@/kind'], 'um curso não é publicado como sede');
    $r = $auroraAdmin->publish('course', 'concursos', json_encode(Json::decode($auroraStudent->course('aurora.concursos')['content']), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION) ?: '', $now);
    check(!$r['created'] && $r['version'] === 1, 'republicar o mesmo conteúdo não cria versão nova');

    echo "--- vínculo: camada da instituição e versão nova do curso-modelo\n";
    $etag1 = $auroraStudent->course('campus-demo')['etag'];
    $r = $auroraAdmin->publish('overlay', 'campus-demo', Json::encodeArray($overlay), $now);
    $course = $auroraStudent->course('campus-demo');
    $ids = array_column(Json::decode($course['content'])['phases'][0]['city']['buildings'], 'id');
    check($r['created'] && $course['overlayVersion'] === 1 && in_array('cantina', $ids, true) && $course['etag'] !== $etag1, 'a Aurora publica uma camada com a cantina: o aluno vê a cantina, e o ETag muda');
    [$why, $problems] = rejected(static fn () => $auroraAdmin->publish('overlay', 'campus-demo', Json::encodeArray(['schema' => 1, 'kind' => 'overlay', 'courseId' => 'campus-demo', 'phases' => ['fase-1' => ['set' => ['quests' => ['resumir' => ['rewardXp' => 9999]]]]]]), $now));
    check($why === 'CONTENT_INVALID' && $problems === ['OVERLAY_TARGET_LOCKED@/phases/fase-1/set/quests/resumir'], 'a camada que muda o XP de uma missão travada é recusada');
    check(rejected(static fn () => $borealAdmin->publish('overlay', 'campus-demo', Json::encodeArray($overlay), $now))[0] === 'NOT_FOUND', 'a Boreal não publica camada de um curso que ela não vinculou');

    copy("{$root}/platform/courses/campus-demo/v2.json", "{$platform}/courses/campus-demo/v2.json"); // a release traz a versão 2
    $state = $auroraAdmin->refreshLinks();
    $link = $auroraAdmin->courses()[0];
    $course = $auroraStudent->course('campus-demo');
    $ids = array_column(Json::decode($course['content'])['phases'][0]['city']['buildings'], 'id');
    check($state === [['courseId' => 'campus-demo', 'adoptedVersion' => 1, 'pendingVersion' => 2]] && $link['pendingVersion'] === 2, 'versão 2 com o Observatório em cima da cantina: a Aurora segura a versão 1, e a 2 fica pendente');
    $pending = $pdo->query("SELECT pending_problems FROM course_links WHERE tenant_id = {$aurora}")->fetchColumn();
    check(json_decode((string) $pending, true) === ['BUILDINGS_OVERLAP@/phases/0/city/buildings/3'], 'o admin vê o problema da pendência com código e caminho');
    check($course['version'] === 1 && in_array('cantina', $ids, true) && !in_array('observatorio', $ids, true), 'o aluno continua na versão 1 (nunca recebe uma cidade inválida)');
    $r = $borealAdmin->link('campus-demo', $now);
    check($r['adoptedVersion'] === 2, 'a Boreal, que vincula agora, já entra na versão 2');
    $fixed = $overlay;
    $fixed['phases']['fase-1']['add']['buildings'][0]['position'] = [10, 8];
    $r = $auroraAdmin->publish('overlay', 'campus-demo', Json::encodeArray($fixed), $now);
    $course = $auroraStudent->course('campus-demo');
    $ids = array_column(Json::decode($course['content'])['phases'][0]['city']['buildings'], 'id');
    check($r['version'] === 2 && $r['adoptedVersion'] === 2 && $course['version'] === 2 && in_array('cantina', $ids, true) && in_array('observatorio', $ids, true), 'o admin move a cantina: a camada nova resolve a pendência e a versão 2 é adotada na hora');
    check($auroraAdmin->courses()[0]['pendingVersion'] === null, 'a pendência some');

    echo "--- cópia para editar\n";
    $r = $auroraAdmin->copy('campus-demo', 'campus-proprio', $now);
    $copy = $auroraStudent->course('aurora.campus-proprio');
    $copyDoc = Json::decode($copy['content']);
    check($r['created'] && $copyDoc['courseId'] === 'aurora.campus-proprio' && $copyDoc['copiedFrom'] === ['courseId' => 'campus-demo', 'version' => 2], 'a cópia vira um curso da Aurora, com id próprio e a origem registrada');
    check(!has_key($copyDoc, 'locked') && in_array('cantina', array_column($copyDoc['phases'][0]['city']['buildings'], 'id'), true), 'a cópia leva a camada e perde as travas: agora a Aurora edita tudo');
    $edited = mutate($copyDoc, [['op' => 'set', 'path' => '/phases/0/quests/0/rewardXp', 'value' => 120]]);
    $r = $auroraAdmin->publish('course', 'campus-proprio', Json::encodeArray($edited), $now);
    check($r['version'] === 2 && $auroraStudent->questRewards('aurora.campus-proprio')['ler-o-guia'] === 120 && $auroraStudent->questRewards('campus-demo')['ler-o-guia'] === 100, 'na cópia, a Aurora muda o XP de uma missão do modelo; no curso vinculado, ele continua o do modelo');
    check(count($auroraStudent->courses()) === 3, 'a Aurora vê 3 cursos: o vinculado, o dela e a cópia');

    echo "--- Gherkin: progresso de hoje preservado\n";
    $rewards = $auroraStudent->questRewards('campus-demo');
    check(array_intersect_key($rewards, $oldQuests) === $oldQuests && $xp($rewards) === 250, 'no curso vinculado (com camada e versão 2), as missões de hoje têm o mesmo id e o mesmo XP: o aluno continua com 250');

    echo "--- isolamento no Repository\n";
    $guard = new class ($pdo, new TenantContext($aurora, 'aurora', 10, 'tenant_admin')) extends TenantScopedRepository {
        public function leak(): void
        {
            $this->run('SELECT content FROM course_document_versions');
        }

        public function spoof(): void
        {
            $this->run('SELECT content FROM course_document_versions WHERE tenant_id = :tenant_id', ['tenant_id' => 2]);
        }
    };
    foreach (['leak' => 'SQL sem o filtro "tenant_id = :tenant_id" nem chega ao banco', 'spoof' => 'quem chama não consegue trocar o tenant_id da sessão'] as $method => $what) {
        $threw = false;
        try {
            $guard->{$method}();
        } catch (LogicException) {
            $threw = true;
        }
        check($threw, $what);
    }

    if ($config['DB_DRIVER'] === 'pgsql') {
        echo "--- PostgreSQL: Row Level Security (segunda barreira)\n";
        $pdo->exec("DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spike_app') THEN CREATE ROLE spike_app NOLOGIN; END IF; END \$\$");
        // UPDATE em course_documents: o SELECT ... FOR UPDATE da publicação exige.
        $pdo->exec('GRANT SELECT, INSERT, UPDATE ON course_documents, course_document_versions, course_links TO spike_app');
        $pdo->exec('GRANT USAGE ON SEQUENCE course_documents_id_seq TO spike_app');
        $app = ConnectionFactory::create($config);
        $app->exec('SET ROLE spike_app'); // a aplicação usa um papel comum: superusuários ignoram o RLS
        check((int) $app->query('SELECT COUNT(*) FROM course_documents')->fetchColumn() === 0, 'sem app.tenant_id, um SELECT sem WHERE não vê documento nenhum');
        $appBoreal = spike_course_service($app, new TenantContext($boreal, 'boreal', 10, 'tenant_admin'), $platform);
        $rows = $app->query('SELECT DISTINCT tenant_id FROM course_links')->fetchAll(PDO::FETCH_COLUMN);
        check(array_map('intval', $rows) === [$boreal], 'com a Boreal informada, até um SELECT sem WHERE só vê os vínculos da Boreal');
        $blocked = false;
        try {
            $app->prepare("INSERT INTO course_documents (tenant_id, kind, slug, created_at) VALUES ({$aurora}, 'course', 'invasao', '2026-10-29 10:00:00')")->execute();
        } catch (PDOException) {
            $blocked = true;
        }
        check($blocked, 'gravar um documento para a Aurora com a sessão da Boreal é recusado pelo banco (WITH CHECK)');
        $r = $appBoreal->publish('headquarters', 'sede', Json::encodeArray($hq), $now);
        check($r['created'] && $r['version'] === 1, 'com o papel comum (e o RLS ligado), a Boreal publica a sede dela normalmente');
    }

    echo "--- publicações em paralelo (a trava do documento)\n";
    $procs = [];
    $env = getenv();
    foreach (['A', 'B'] as $mark) {
        $procs[$mark] = proc_open([PHP_BINARY, __DIR__ . '/publish-worker.php', $config['DB_DRIVER'], (string) $aurora, 'aurora', 'paralelo', '10', $mark], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes[$mark], null, $env);
    }
    $versions = [];
    foreach ($procs as $mark => $proc) {
        $out = stream_get_contents($pipes[$mark][1]);
        $err = stream_get_contents($pipes[$mark][2]);
        proc_close($proc);
        if ($err !== '') {
            echo "   {$mark}: {$err}\n";
        }
        $versions = array_merge($versions, (array) json_decode((string) $out, true));
    }
    sort($versions);
    check($versions === range(1, 20), '2 processos × 10 publicações do mesmo curso: versões 1 a 20, sem repetir nem pular');
}

// ---------------------------------------------------------------- ponta a ponta HTTP
$label = array_key_first($targets);
$config = $targets[$label];
echo "=== HTTP de verdade (php -S, {$label})\n";
$pdo = ConnectionFactory::create($config);
$aurora = (int) $pdo->query("SELECT id FROM tenants WHERE slug = 'aurora'")->fetchColumn();
$boreal = (int) $pdo->query("SELECT id FROM tenants WHERE slug = 'boreal'")->fetchColumn();
$sock = stream_socket_server('tcp://127.0.0.1:0');
$port = (int) substr(strrchr(stream_socket_get_name($sock, false), ':'), 1);
fclose($sock);
$env = ['SPIKE_DB_DRIVER' => $config['DB_DRIVER'], 'SPIKE_DB_HOST' => $config['DB_HOST'], 'SPIKE_DB_PORT' => (string) $config['DB_PORT'], 'SPIKE_DB_NAME' => $config['DB_NAME'], 'SPIKE_DB_USER' => $config['DB_USER'], 'SPIKE_DB_PASS' => $config['DB_PASS']];
$server = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', $root . '/http'], [['pipe', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']], $pipes, null, $env + getenv());
for ($i = 0; $i < 50 && @fsockopen('127.0.0.1', $port) === false; $i++) {
    usleep(100_000);
}

/** @return array{int, array, array<string, string>} status, corpo e cabeçalhos (nomes em minúsculas) */
$http = static function (string $method, string $route, ?string $session, ?array $json = null, array $query = [], ?string $etag = null) use ($port): array {
    $headers = ['Accept: application/json'];
    if ($session !== null) {
        $headers[] = "X-Spike-Session: {$session}";
    }
    if ($etag !== null) {
        $headers[] = "If-None-Match: {$etag}";
    }
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $json === null ? '' : json_encode($json), 'ignore_errors' => true, 'timeout' => 10]]);
    $url = "http://127.0.0.1:{$port}/api/courses.php?" . http_build_query(['route' => $route] + $query);
    $body = (string) @file_get_contents($url, false, $ctx);
    $lines = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $lines[0] ?? '', $m);
    $h = [];
    foreach (array_slice($lines, 1) as $line) {
        [$name, $value] = array_map('trim', explode(':', $line, 2)) + [1 => ''];
        $h[strtolower($name)] = $value;
    }
    return [(int) ($m[1] ?? 0), (array) json_decode($body, true), $h];
};
$student = "{$aurora}:aurora:20:student";
$admin = "{$aurora}:aurora:10:tenant_admin";
$borealSession = "{$boreal}:boreal:21:student";

try {
    [$st, $body] = $http('GET', 'courses', null);
    check($st === 401 && $body['error']['code'] === 'UNAUTHENTICATED', 'sem sessão: 401');
    [$st, $body, $h] = $http('GET', 'headquarters', $student);
    check($st === 200 && $body['data']['source'] === 'tenant' && $body['data']['content']['kind'] === 'headquarters' && ($h['cache-control'] ?? '') === 'private, no-cache' && isset($h['etag']), 'GET headquarters: 200, a sede da Aurora, ETag e Cache-Control: private, no-cache');
    [$st, $body] = $http('GET', 'headquarters', $student, null, [], $h['etag']);
    check($st === 304 && $body === [], 'com If-None-Match igual: 304 sem corpo (o aluno não baixa a sede de novo)');
    [$st, $body] = $http('GET', 'courses', $student);
    check($st === 200 && array_column($body['data']['courses'], 'courseId') === ['campus-demo', 'aurora.campus-proprio', 'aurora.concursos', 'aurora.paralelo'], 'GET courses: o vinculado e os da Aurora');
    [$st, $body, $h] = $http('GET', 'course', $student, null, ['courseId' => 'campus-demo']);
    check($st === 200 && $body['data']['version'] === 2 && $body['data']['overlayVersion'] === 2 && count($body['data']['content']['phases']) === 1 && isset($h['etag']), 'GET course: o curso vinculado (versão 2 com a camada 2), cidade e fases num documento só');
    [$st, $body] = $http('GET', 'course', $borealSession, null, ['courseId' => 'aurora.concursos']);
    check($st === 404 && $body['error']['code'] === 'COURSE_NOT_FOUND', 'Gherkin pela API: o curso da Aurora pedido pela Boreal é 404 COURSE_NOT_FOUND');
    $bad = mutate($hq, [['op' => 'remove', 'path' => '/city/buildings/0']]);
    [$st, $body] = $http('POST', 'publish', $admin, ['kind' => 'headquarters', 'slug' => 'sede', 'content' => $bad]);
    check($st === 422 && $body['error']['code'] === 'CONTENT_INVALID' && $body['error']['problems'] === [['code' => 'ROLE_MISSING', 'path' => '/city/buildings', 'param' => 'enrollment']], 'POST publish de sede sem Matrículas: 422 com {code, path, param}');
    $conflict = $overlay;
    $conflict['phases']['fase-1']['add']['buildings'][0]['position'] = [-6, -4];
    [$st, $body] = $http('POST', 'publish', $admin, ['kind' => 'overlay', 'slug' => 'campus-demo', 'content' => $conflict]);
    check($st === 422 && !isset($body['error']['problems']) && ($body['error']['mergedProblems'][0]['code'] ?? '') === 'BUILDINGS_OVERLAP', 'camada que quebra a mescla: 422 com os problemas do curso mesclado (mergedProblems)');
    [$st] = $http('POST', 'publish', $student, ['kind' => 'headquarters', 'slug' => 'sede', 'content' => $hq]);
    check($st === 403, 'aluno publicando: 403');
    [$st, $body] = $http('POST', 'link', "{$boreal}:boreal:11:tenant_admin", ['courseId' => 'nao-existe']);
    check($st === 404, 'vincular um curso que a plataforma não tem: 404');
    [$st] = $http('GET', 'publish', $admin);
    check($st === 405, 'método errado: 405');
} finally {
    proc_terminate($server);
    proc_close($server);
}

exit($failed ? 1 : 0);
