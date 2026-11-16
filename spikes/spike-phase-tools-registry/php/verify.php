<?php
declare(strict_types=1);

// Prova o lado do servidor: os mesmos casos de conformidade do TypeScript (cases/*.json), o mesmo registro
// (src/Content/tool-types.json) e o tipo de exemplo (fixtures/example-type.json) entrando sem mudar esta classe nem o
// resultado dos tipos de antes. Sem banco: o registro e a validação são só regra. Dados 100% fictícios.

require_once __DIR__ . '/src/ToolRegistry.php';

use Spike\Tools\ToolRegistry;

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

/** @return array<string, mixed> */
function json(string $rel): array
{
    global $root;
    return json_decode((string) file_get_contents("{$root}/{$rel}"), true, 64, JSON_THROW_ON_ERROR);
}

/** @param list<string> $names */
function registry(array $names): ToolRegistry
{
    $files = ['base' => 'src/Content/tool-types.json', 'example' => 'fixtures/example-type.json'];
    return new ToolRegistry(...array_map(static fn (string $n): array => json($files[$n]), $names));
}

/** @param list<array{code: string, path: string, param?: string}> $problems */
function keys(array $problems): array
{
    $out = array_map(static fn (array $p): string => $p['code'] . (isset($p['param']) ? "({$p['param']})" : '') . '@' . $p['path'], $problems);
    sort($out);
    return $out;
}

echo "--- casos de conformidade (os mesmos do TypeScript)\n";
$files = glob("{$root}/cases/*.json") ?: [];
sort($files);
$ok = 0;
foreach ($files as $file) {
    $c = json('cases/' . basename($file));
    $ctx = ['buildingId' => $c['room']['buildingId'], 'quests' => $c['quests'], 'texts' => $c['texts']];
    $got = keys(registry($c['registries'])->validateItems($c['room']['items'], $ctx));
    $want = $c['expect'];
    sort($want);
    if ($got === $want) {
        $ok++;
    } else {
        check(false, basename($file) . ': esperava [' . implode(', ', $want) . '], veio [' . implode(', ', $got) . ']');
    }
}
check($ok === count($files) && $ok === 19, "{$ok} de " . count($files) . ' casos: cada um dá exatamente os problemas esperados');

echo "--- o registro\n";
$base = registry(['base']);
$both = registry(['base', 'example']);
check(array_column($base->editorKinds('pt-BR'), 'label') === ['Quadro', 'Totem de vídeo'], 'o registro da plataforma tem o quadro e o totem de vídeo, na ordem do editor');
check(array_column($both->editorKinds('en-US'), 'label') === ['Board', 'Video totem', 'Sample quiz'], 'Gherkin "Tipo novo sem mexer no motor": com uma entrada no JSON, o editor oferece o tipo novo');
$same = true;
foreach ($files as $file) {
    $c = json('cases/' . basename($file));
    if (in_array('example', $c['registries'], true) || str_contains($file, 'fora-do-registro')) {
        continue;
    }
    $ctx = ['buildingId' => $c['room']['buildingId'], 'quests' => $c['quests'], 'texts' => $c['texts']];
    $same = $same && keys($base->validateItems($c['room']['items'], $ctx)) === keys($both->validateItems($c['room']['items'], $ctx));
}
check($same, 'o tipo novo não muda o resultado de nenhum caso dos tipos de antes (Open/Closed)');

$type = static fn (array $over): array => ['types' => [array_merge(['kind' => 'novo', 'label' => ['pt-BR' => 'Novo', 'en-US' => 'New'], 'icon' => 'x', 'quest' => 'none', 'target' => true, 'action' => 'modal', 'fields' => []], $over)]];
$refused = static function (array $file, string $message, ?array $second = null): bool {
    try {
        $second === null ? new ToolRegistry($file) : new ToolRegistry($file, $second);
    } catch (\InvalidArgumentException $e) {
        return str_contains($e->getMessage(), $message);
    }
    return false;
};
check(
    $refused(json('src/Content/tool-types.json'), 'o tipo "board" está repetido', json('src/Content/tool-types.json'))
    && $refused($type(['kind' => 'Novo']), 'kind "Novo" fora do formato')
    && $refused($type(['fields' => ['nota' => ['format' => 'decimal']]]), 'novo.nota tem o formato desconhecido "decimal"')
    && $refused($type(['fields' => ['nota' => ['format' => 'int', 'min' => 10, 'max' => 1]]]), 'novo.nota (int) precisa de min <= max')
    && $refused($type(['fields' => ['modo' => ['format' => 'enum', 'values' => []]]]), 'novo.modo (enum) precisa dos valores')
    && $refused($type(['fields' => ['questId' => ['format' => 'textKey']]]), 'novo.questId não pode ser campo de um tipo')
    && $refused($type(['target' => false]), 'novo tem ação, mas não é alvo da tecla E')
    && $refused($type(['exclusive' => ['fields' => ['a', 'b'], 'both' => 'X']]), 'novo.exclusive'),
    'registro malformado não sobe, e o erro diz o tipo e o campo (as mesmas mensagens do TypeScript)',
);

exit($failed ? 1 : 0);
