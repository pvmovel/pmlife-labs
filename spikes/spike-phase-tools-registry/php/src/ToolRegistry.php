<?php
declare(strict_types=1);

namespace Spike\Tools;

/**
 * O registro declarativo dos tipos de objeto da sala (US57), no servidor: lê o MESMO src/Content/tool-types.json do
 * TypeScript e valida os objetos com ele (src/Domain/ToolRegistry.ts). Os casos de conformidade (cases/*.json) provam
 * que os dois lados dão os mesmos problemas. Uma ferramenta nova é uma entrada no JSON: esta classe não muda. Só um
 * formato novo é escrito aqui e no TypeScript.
 */
final class ToolRegistry
{
    public const FORMATS = ['textKey', 'int', 'enum', 'videoRef', 'youtubeId', 'fileRef'];
    private const KIND = '/^[a-z][a-z0-9-]{1,30}$/';
    private const FIELD = '/^[a-z][A-Za-z0-9]{1,30}$/';
    private const COMMON = ['id', 'kind', 'width', 'textKey', 'placement', 'wall', 'offset', 'x', 'z', 'facing', 'questId'];
    private const ID = '/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/';
    private const TEXT_KEY = '/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/';
    private const FILE_REF = '/^[a-z0-9][a-z0-9-]{0,39}$/';
    private const WALLS = ['north', 'east', 'south', 'west'];
    private const VIDEO_ID = '/^[A-Za-z0-9_-]{11}$/';
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';
    /** Os campos de cada plataforma de vídeo (o mesmo do Video.ts): os obrigatórios e os opcionais. */
    private const VIDEO_FIELDS = [
        'youtube' => ['required' => ['id' => self::VIDEO_ID], 'optional' => []],
        'vimeo' => ['required' => ['id' => '/^[1-9][0-9]{0,11}$/'], 'optional' => ['hash' => '/^[0-9a-f]{6,20}$/']],
        'panda' => ['required' => ['zone' => '/^[0-9a-z]{8}-[0-9a-z]{3}$/', 'id' => self::UUID], 'optional' => []],
        'bunny' => ['required' => ['library' => '/^[1-9][0-9]{0,9}$/', 'id' => self::UUID], 'optional' => ['legacy' => true]],
    ];

    /** @var array<string, array<string, mixed>> kind => tipo */
    private array $types = [];
    /** @var list<array{code: string, path: string, param?: string}> */
    private array $problems = [];
    /** @var array<string, string> */
    private array $usedKeys = [];

    /**
     * Lê e confere o registro (um ou mais arquivos, na ordem). Registro malformado lança a exceção com o tipo e o campo.
     *
     * @param array<string, mixed> ...$files
     */
    public function __construct(array ...$files)
    {
        foreach ($files as $file) {
            if (!isset($file['types']) || !is_array($file['types']) || !array_is_list($file['types'])) {
                throw new \InvalidArgumentException('registro: types precisa ser uma lista');
            }
            foreach ($file['types'] as $t) {
                $kind = (string) ($t['kind'] ?? '');
                if (preg_match(self::KIND, $kind) !== 1) {
                    throw new \InvalidArgumentException("registro: kind \"{$kind}\" fora do formato");
                }
                if (isset($this->types[$kind])) {
                    throw new \InvalidArgumentException("registro: o tipo \"{$kind}\" está repetido");
                }
                if (!is_string($t['label']['pt-BR'] ?? null) || !is_string($t['label']['en-US'] ?? null) || $t['label']['pt-BR'] === '' || $t['label']['en-US'] === '') {
                    throw new \InvalidArgumentException("registro: {$kind} precisa do nome em pt-BR e en-US");
                }
                if (!is_string($t['icon'] ?? null) || $t['icon'] === '') {
                    throw new \InvalidArgumentException("registro: {$kind} precisa de um ícone");
                }
                if (!in_array($t['quest'] ?? null, ['none', 'optional', 'required'], true)) {
                    throw new \InvalidArgumentException("registro: {$kind}.quest precisa ser none, optional ou required");
                }
                if (!is_bool($t['target'] ?? null)) {
                    throw new \InvalidArgumentException("registro: {$kind}.target precisa ser true ou false");
                }
                if (!in_array($t['action'] ?? null, ['none', 'video', 'modal'], true)) {
                    throw new \InvalidArgumentException("registro: {$kind}.action precisa ser none, video ou modal");
                }
                if ($t['action'] !== 'none' && !$t['target']) {
                    throw new \InvalidArgumentException("registro: {$kind} tem ação, mas não é alvo da tecla E");
                }
                $fields = $t['fields'] ?? [];
                foreach ($fields as $name => $f) {
                    if (preg_match(self::FIELD, (string) $name) !== 1 || in_array($name, self::COMMON, true)) {
                        throw new \InvalidArgumentException("registro: {$kind}.{$name} não pode ser campo de um tipo");
                    }
                    if (!in_array($f['format'] ?? null, self::FORMATS, true)) {
                        $format = (string) ($f['format'] ?? '');
                        throw new \InvalidArgumentException("registro: {$kind}.{$name} tem o formato desconhecido \"{$format}\"");
                    }
                    if ($f['format'] === 'int' && !(is_int($f['min'] ?? null) && is_int($f['max'] ?? null) && $f['min'] <= $f['max'])) {
                        throw new \InvalidArgumentException("registro: {$kind}.{$name} (int) precisa de min <= max");
                    }
                    if ($f['format'] === 'enum' && !(is_array($f['values'] ?? null) && $f['values'] !== [] && count(array_filter($f['values'], 'is_string')) === count($f['values']))) {
                        throw new \InvalidArgumentException("registro: {$kind}.{$name} (enum) precisa dos valores");
                    }
                }
                $ex = $t['exclusive'] ?? null;
                if ($ex !== null && (count($ex['fields'] ?? []) < 2 || array_diff($ex['fields'], array_keys($fields)) !== [] || !is_string($ex['both'] ?? null))) {
                    throw new \InvalidArgumentException("registro: {$kind}.exclusive precisa de 2 campos do tipo e do código");
                }
                $this->types[$kind] = $t;
            }
        }
    }

    /**
     * O que o editor oferece: os tipos na ordem do registro, no idioma pedido.
     *
     * @return list<array{kind: string, label: string, icon: string}>
     */
    public function editorKinds(string $locale): array
    {
        return array_values(array_map(static fn (array $t): array => ['kind' => $t['kind'], 'label' => $t['label'][$locale], 'icon' => $t['icon']], $this->types));
    }

    /**
     * Valida os objetos de uma sala (a mesma ordem e os mesmos códigos do TypeScript).
     *
     * @param list<mixed> $items
     * @param array{buildingId: string, quests: list<array{id: string, buildingId: string}>, texts: list<string>} $ctx
     * @return list<array{code: string, path: string, param?: string}>
     */
    public function validateItems(array $items, array $ctx, string $at = '/items'): array
    {
        $this->problems = [];
        $this->usedKeys = [];
        foreach ($items as $k => $w) {
            $wp = "{$at}/{$k}";
            if (!is_array($w) || array_is_list($w) && $w !== []) {
                $this->missing($w, $wp);
                continue;
            }
            if (array_key_exists('placement', $w) && $w['placement'] !== 'wall' && $w['placement'] !== 'floor') {
                $this->add('PLACEMENT_UNKNOWN', "{$wp}/placement");
                continue;
            }
            $floor = ($w['placement'] ?? null) === 'floor';
            $ok = $this->id($w, 'id', $wp);
            $ok = $floor
                ? $ok & $this->number($w, 'x', $wp) & $this->number($w, 'z', $wp) & $this->string($w, 'facing', $wp)
                : $ok & $this->string($w, 'wall', $wp) & $this->number($w, 'offset', $wp);
            $ok = $ok & $this->number($w, 'width', $wp) & $this->string($w, 'kind', $wp) & $this->textKey($w, 'textKey', $wp);
            if (!$ok) {
                continue;
            }
            $side = $floor ? 'facing' : 'wall';
            if (!in_array($w[$side], self::WALLS, true)) {
                $this->add('WALL_UNKNOWN', "{$wp}/{$side}");
                continue;
            }
            $type = $this->types[$w['kind']] ?? null;
            if ($type === null) {
                $this->add('WALL_ITEM_KIND_UNKNOWN', "{$wp}/kind");
                continue;
            }
            $this->toolRules($w, $wp, $type, $ctx);
        }
        foreach ($this->usedKeys as $key => $where) {
            if (!in_array($key, $ctx['texts'], true)) {
                $this->add('TEXT_KEY_MISSING', $where);
            }
        }
        return $this->problems;
    }

    /**
     * @param array<string, mixed> $w
     * @param array<string, mixed> $type
     * @param array{buildingId: string, quests: list<array{id: string, buildingId: string}>, texts: list<string>} $ctx
     */
    private function toolRules(array $w, string $wp, array $type, array $ctx): void
    {
        if (isset($type['exclusive'])) {
            $present = array_values(array_filter($type['exclusive']['fields'], static fn (string $f): bool => array_key_exists($f, $w)));
            if (count($present) > 1) {
                $this->add($type['exclusive']['both'], $wp);
                return;
            }
            if ($present === []) {
                $this->add('FIELD_REQUIRED', "{$wp}/{$type['exclusive']['fields'][0]}");
                return;
            }
        }
        foreach ($type['fields'] ?? [] as $name => $spec) {
            $fp = "{$wp}/{$name}";
            if (!array_key_exists($name, $w)) {
                if (($spec['required'] ?? false) === true) {
                    $this->add('FIELD_REQUIRED', $fp);
                }
                continue;
            }
            $v = $w[$name];
            switch ($spec['format']) {
                case 'textKey':
                    $this->textKey($w, $name, $wp);
                    break;
                case 'int':
                    if (!is_int($v)) {
                        $this->add('FIELD_TYPE', $fp);
                    } elseif ($v < $spec['min'] || $v > $spec['max']) {
                        $this->add('FIELD_RANGE', $fp);
                    }
                    break;
                case 'enum':
                    if (!is_string($v)) {
                        $this->add('FIELD_TYPE', $fp);
                    } elseif (!in_array($v, $spec['values'], true)) {
                        $this->add('FIELD_ENUM', $fp);
                    }
                    break;
                case 'fileRef':
                    if (!is_string($v)) {
                        $this->add('FIELD_TYPE', $fp);
                    } elseif (preg_match(self::FILE_REF, $v) !== 1) {
                        $this->add('FILE_REF_INVALID', $fp);
                    }
                    break;
                case 'youtubeId':
                    if (!is_string($v) || trim($v) === '' || strlen($v) > 120) {
                        $this->add($v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', $fp);
                    } elseif (preg_match(self::VIDEO_ID, $v) !== 1) {
                        $this->add('VIDEO_ID_INVALID', $fp);
                    }
                    break;
                case 'videoRef':
                    $problem = self::videoRefProblem($v);
                    if ($problem !== null) {
                        $this->add($problem, $problem === 'VIDEO_PROVIDER_UNKNOWN' ? "{$fp}/provider" : $fp);
                    }
                    break;
            }
        }
        $qp = "{$wp}/questId";
        $has = array_key_exists('questId', $w);
        if ($type['quest'] === 'none') {
            if ($has) {
                $this->add('TOOL_QUEST_NOT_ALLOWED', $qp);
            }
            return;
        }
        if (!$has) {
            if ($type['quest'] === 'required') {
                $this->add('FIELD_REQUIRED', $qp);
            }
            return;
        }
        $quest = null;
        foreach ($ctx['quests'] as $q) {
            if ($q['id'] === $w['questId']) {
                $quest = $q;
                break;
            }
        }
        if ($quest === null) {
            $this->add('TOOL_QUEST_UNKNOWN', $qp);
        } elseif ($quest['buildingId'] !== $ctx['buildingId']) {
            $this->add('TOOL_QUEST_OTHER_BUILDING', $qp);
        }
    }

    /** O problema do objeto `video` (o videoRefProblem do Video.ts), ou null. */
    public static function videoRefProblem(mixed $v): ?string
    {
        if (!is_array($v) || (array_is_list($v) && $v !== [])) {
            return 'FIELD_TYPE';
        }
        $provider = $v['provider'] ?? null;
        if (!is_string($provider) || !isset(self::VIDEO_FIELDS[$provider])) {
            return 'VIDEO_PROVIDER_UNKNOWN';
        }
        ['required' => $required, 'optional' => $optional] = self::VIDEO_FIELDS[$provider];
        foreach ($required as $key => $re) {
            if (!is_string($v[$key] ?? null) || preg_match($re, $v[$key]) !== 1) {
                return 'VIDEO_INVALID';
            }
        }
        foreach ($v as $key => $value) {
            if ($key === 'provider' || isset($required[$key])) {
                continue;
            }
            if (!array_key_exists($key, $optional)) {
                return 'VIDEO_INVALID';
            }
            $rule = $optional[$key];
            if ($rule === true ? $value !== true : (!is_string($value) || preg_match($rule, $value) !== 1)) {
                return 'VIDEO_INVALID';
            }
        }
        return null;
    }

    private function add(string $code, string $path, ?string $param = null): void
    {
        $this->problems[] = $param === null ? ['code' => $code, 'path' => $path] : ['code' => $code, 'path' => $path, 'param' => $param];
    }

    private function missing(mixed $v, string $at): bool
    {
        $this->add($v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', $at);
        return false;
    }

    /** @param array<string, mixed> $o */
    private function number(array $o, string $f, string $at): bool
    {
        $v = $o[$f] ?? null;
        return ((is_int($v) || is_float($v)) && is_finite((float) $v)) || $this->missing($v, "{$at}/{$f}");
    }

    /** @param array<string, mixed> $o */
    private function string(array $o, string $f, string $at): bool
    {
        $v = $o[$f] ?? null;
        return (is_string($v) && trim($v) !== '' && strlen($v) <= 120) || $this->missing($v, "{$at}/{$f}");
    }

    /** @param array<string, mixed> $o */
    private function id(array $o, string $f, string $at): bool
    {
        if (!$this->string($o, $f, $at)) {
            return false;
        }
        if (preg_match(self::ID, (string) $o[$f]) === 1) {
            return true;
        }
        $this->add('ID_INVALID', "{$at}/{$f}");
        return false;
    }

    /** @param array<string, mixed> $o */
    private function textKey(array $o, string $f, string $at): bool
    {
        if (!$this->string($o, $f, $at)) {
            return false;
        }
        if (preg_match(self::TEXT_KEY, (string) $o[$f]) !== 1) {
            $this->add('TEXT_KEY_INVALID', "{$at}/{$f}");
            return false;
        }
        $this->usedKeys[$o[$f]] ??= "{$at}/{$f}";
        return true;
    }
}
