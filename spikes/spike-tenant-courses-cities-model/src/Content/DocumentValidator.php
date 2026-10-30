<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

/**
 * Valida um documento do modelo de ensino (ADR-012, formato 1) e devolve a lista de problemas (vazia = válido).
 *
 * - "headquarters": a sede da instituição, uma cidade 3D com Matrículas, Institucional, Secretaria e Portal dos cursos.
 * - "course": o curso inteiro num documento só (decisão do Pablo): a cidade do curso (com Portal das fases e Mural),
 *   as fases (cada fase é uma cidade, com as suas missões e os pré-requisitos de outras fases), os atributos que o
 *   curso usa e a escada de níveis. Só a FORMA e as REFERÊNCIAS da progressão; as regras de quem sobe de nível são
 *   da US43.
 *
 * As três cidades usam a mesma regra (campus, NPCs e salas), que espelha a do domínio TypeScript (CampusLayout,
 * BuildingInterior, QuestCatalog, CareerLadder). A pasta cases/ tem os casos de conformidade que os dois lados rodam.
 *
 * Duas fases: primeiro a forma (tipos, campos obrigatórios, limites de tamanho); só com a forma certa vêm as regras de
 * geometria e referência, que confiam nos tipos.
 */
final class DocumentValidator
{
    public const SCHEMA = 1;
    public const LOCALES = ['pt-BR', 'en-US'];

    /** Prédios obrigatórios por tipo de cidade (movíveis: a posição é livre, o papel não). */
    public const REQUIRED_ROLES = [
        'headquarters' => ['enrollment', 'institutional', 'secretariat', 'courses-portal'],
        'course' => ['phases-portal', 'board'],
        'phase' => [],
    ];

    public const MAX_BUILDINGS = 40;
    public const MAX_NPCS = 40;
    public const MAX_LEVELS = 30;
    public const MAX_PHASES = 30;
    public const MAX_QUESTS = 200;
    public const MAX_ATTRIBUTES = 20;
    public const MAX_INTERIORS = 40;
    public const MAX_STATIONS = 40;
    public const MAX_TEXT_KEYS = 4000;
    public const MAX_TEXT_LENGTH = 300;

    /** Meia largura do corpo de um NPC (NPC_BODY_RADIUS do domínio). */
    public const NPC_BODY_RADIUS = 0.4;
    /** Raio do avatar (DEFAULT_MOVEMENT.radius). */
    public const AVATAR_RADIUS = 0.5;
    /** Meia largura do vão da porta da sala (DOOR_HALF_WIDTH). */
    public const DOOR_HALF_WIDTH = 1.0;
    private const ENTRY_DEPTH = 1.5;
    private const EXIT_OFFSET = 1.5;

    private const ID = '/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/';
    private const TEXT_KEY = '/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/';
    private const HEX_COLOR = '/^#[0-9a-fA-F]{6}$/';
    private const PERSONA = '/^[a-z][a-z0-9_]{0,31}$/';

    /** @var list<Problem> */
    private array $problems = [];
    /** @var array<string, string> chave de texto => onde foi usada (a primeira vez) */
    private array $usedKeys = [];

    /** @return list<Problem> */
    public static function validate(mixed $doc): array
    {
        $v = new self();
        $v->run($doc);
        return $v->problems;
    }

    private function run(mixed $doc): void
    {
        if (!self::isObject($doc)) {
            $this->add('DOC_NOT_OBJECT', '');
            return;
        }
        if (($doc['schema'] ?? null) !== self::SCHEMA) {
            $this->add('SCHEMA_UNSUPPORTED', '/schema');
            return;
        }
        $kind = $doc['kind'] ?? null;
        if ($kind !== 'headquarters' && $kind !== 'course') {
            $this->add('KIND_UNSUPPORTED', '/kind');
            return;
        }
        $this->textKey($doc, 'titleKey', '');

        if ($kind === 'headquarters') {
            if ($this->cityShape($doc['city'] ?? null, '/city') & $this->textsShape($doc['texts'] ?? null, '/texts')) {
                $this->cityRules($doc['city'], '/city', 'headquarters', []);
                $this->textsRules($doc['texts']);
            }
            return;
        }

        if (!is_string($doc['courseId'] ?? null) || !CourseId::isValid($doc['courseId'])) {
            $this->add('COURSE_ID_INVALID', '/courseId');
        }
        if (array_key_exists('copiedFrom', $doc)) {
            $this->copiedFromShape($doc['copiedFrom'], '/copiedFrom');
        }
        $shapeOk = $this->attributesShape($doc['attributes'] ?? null, '/attributes')
            & $this->levelsShape($doc['levels'] ?? null, '/levels')
            & $this->cityShape($doc['city'] ?? null, '/city')
            & $this->phasesShape($doc['phases'] ?? null, '/phases')
            & $this->textsShape($doc['texts'] ?? null, '/texts');
        if (!$shapeOk) {
            return;
        }
        $attributes = $doc['attributes'];
        $phaseIds = array_column($doc['phases'], 'id');
        $this->attributesRules($attributes);
        $this->levelsRules($doc['levels'], $attributes, $phaseIds);
        $this->cityRules($doc['city'], '/city', 'course', []);
        $this->phasesRules($doc['phases'], $attributes);
        $this->textsRules($doc['texts']);
    }

    // ------------------------------------------------------------------ forma

    private function cityShape(mixed $c, string $at): bool
    {
        if (!self::isObject($c)) {
            return $this->missing($c, $at);
        }
        $ok = $this->number($c, 'halfSize', $at);
        if (!self::isObject($c['spawn'] ?? null)) {
            $ok = $this->missing($c['spawn'] ?? null, "{$at}/spawn");
        } else {
            $ok = $this->number($c['spawn'], 'x', "{$at}/spawn") & $this->number($c['spawn'], 'z', "{$at}/spawn")
                & $this->number($c['spawn'], 'heading', "{$at}/spawn") && $ok;
        }
        $ok = $this->list($c, 'buildings', $at, self::MAX_BUILDINGS, function (mixed $b, string $p): bool {
            if (!$this->entityShape($b, $p, true)) {
                return false;
            }
            return !array_key_exists('role', $b) || $this->string($b, 'role', $p);
        }) && $ok;
        if (array_key_exists('npcs', $c)) {
            $ok = $this->list($c, 'npcs', $at, self::MAX_NPCS, function (mixed $n, string $p): bool {
                if (!$this->entityShape($n, $p, false)) {
                    return false;
                }
                return $this->string($n, 'persona', $p);
            }) && $ok;
        }
        if (array_key_exists('interiors', $c)) {
            $ok = $this->list($c, 'interiors', $at, self::MAX_INTERIORS, function (mixed $it, string $p): bool {
                return $this->interiorShape($it, $p);
            }) && $ok;
        }
        return (bool) $ok;
    }

    /** Prédio (com size de 3 números) ou NPC (sem size). */
    private function entityShape(mixed $e, string $at, bool $withSize): bool
    {
        if (!self::isObject($e)) {
            return $this->missing($e, $at);
        }
        $ok = $this->id($e, 'id', $at);
        $ok = $this->textKey($e, 'labelKey', $at) && $ok;
        $ok = $this->tuple($e, 'position', 2, $at) && $ok;
        if ($withSize) {
            $ok = $this->tuple($e, 'size', 3, $at) && $ok;
        }
        $ok = $this->string($e, 'color', $at) && $ok;
        if (array_key_exists('interactionRadius', $e)) {
            $ok = $this->number($e, 'interactionRadius', $at) && $ok;
        }
        return $this->locked($e, $at) && $ok;
    }

    private function interiorShape(mixed $it, string $p): bool
    {
        if (!self::isObject($it)) {
            return $this->missing($it, $p);
        }
        $ok = $this->string($it, 'buildingId', $p) & $this->number($it, 'halfSize', $p) & $this->number($it, 'doorX', $p);
        return $this->list($it, 'stations', $p, self::MAX_STATIONS, function (mixed $s, string $sp): bool {
            if (!self::isObject($s)) {
                return $this->missing($s, $sp);
            }
            return $this->string($s, 'questId', $sp) & $this->tuple($s, 'position', 2, $sp) & $this->tuple($s, 'size', 3, $sp)
                & $this->string($s, 'color', $sp) ? true : false;
        }) && $ok;
    }

    private function attributesShape(mixed $attributes, string $at): bool
    {
        return $this->listAt($attributes, $at, self::MAX_ATTRIBUTES, function (mixed $a, string $p): bool {
            if (is_string($a) && preg_match(self::ID, $a) === 1) {
                return true;
            }
            $this->add(is_string($a) ? 'ID_INVALID' : 'FIELD_TYPE', $p);
            return false;
        });
    }

    private function levelsShape(mixed $levels, string $at): bool
    {
        return $this->listAt($levels, $at, self::MAX_LEVELS, function (mixed $l, string $p): bool {
            if (!self::isObject($l)) {
                return $this->missing($l, $p);
            }
            $ok = $this->id($l, 'id', $p) & $this->textKey($l, 'labelKey', $p) & $this->number($l, 'minXp', $p);
            if (array_key_exists('minAttributes', $l)) {
                $ok = $this->points($l, 'minAttributes', $p, 0) && $ok;
            }
            if (array_key_exists('requiredPhases', $l)) {
                $ok = $this->idList($l, 'requiredPhases', $p) && $ok;
            }
            return (bool) $ok;
        });
    }

    private function phasesShape(mixed $phases, string $at): bool
    {
        return $this->listAt($phases, $at, self::MAX_PHASES, function (mixed $f, string $p): bool {
            if (!self::isObject($f)) {
                return $this->missing($f, $p);
            }
            $ok = $this->id($f, 'id', $p) & $this->textKey($f, 'titleKey', $p) & $this->idList($f, 'requires', $p);
            $ok = $this->cityShape($f['city'] ?? null, "{$p}/city") && $ok;
            return $this->list($f, 'quests', $p, self::MAX_QUESTS, function (mixed $q, string $qp): bool {
                if (!self::isObject($q)) {
                    return $this->missing($q, $qp);
                }
                $ok = $this->id($q, 'id', $qp) & $this->string($q, 'buildingId', $qp) & $this->textKey($q, 'titleKey', $qp)
                    & $this->number($q, 'rewardXp', $qp);
                if (array_key_exists('attributes', $q)) {
                    $ok = $this->points($q, 'attributes', $qp, 1) && $ok;
                }
                return $this->locked($q, $qp) && $ok;
            }) && $ok;
        });
    }

    /** Origem de uma cópia: o curso da plataforma e a versão copiados (só informativo). */
    private function copiedFromShape(mixed $c, string $at): void
    {
        if (!self::isObject($c)) {
            $this->missing($c, $at);
            return;
        }
        $this->string($c, 'courseId', $at);
        if (!is_int($c['version'] ?? null) || $c['version'] < 1) {
            $this->missing($c['version'] ?? null, "{$at}/version");
        }
    }

    private function textsShape(mixed $texts, string $at): bool
    {
        if (!self::isObject($texts)) {
            return $this->missing($texts, $at);
        }
        $ok = true;
        foreach (self::LOCALES as $locale) {
            $p = $at . '/' . self::pointer($locale);
            if (!array_key_exists($locale, $texts)) {
                $this->add('TEXT_LOCALE_MISSING', $p);
                $ok = false;
                continue;
            }
            if (!self::isObject($texts[$locale])) {
                $this->add('FIELD_TYPE', $p);
                $ok = false;
                continue;
            }
            if (count($texts[$locale]) > self::MAX_TEXT_KEYS) {
                $this->add('TOO_MANY', $p);
                $ok = false;
                continue;
            }
            foreach ($texts[$locale] as $key => $text) {
                if (!is_string($text)) {
                    $this->add('FIELD_TYPE', $p . '/' . self::pointer((string) $key));
                    $ok = false;
                }
            }
        }
        return $ok;
    }

    // ------------------------------------------------------------------ regras

    /**
     * Uma cidade (sede, cidade do curso ou fase): campus, NPCs, salas e os prédios obrigatórios do tipo.
     *
     * @param array<string, mixed> $c
     * @param list<array<string, mixed>> $quests as missões desta cidade (só nas fases)
     */
    private function cityRules(array $c, string $at, string $kind, array $quests): void
    {
        $half = (float) $c['halfSize'];
        $buildings = $c['buildings'];
        if ($buildings === []) {
            $this->add('CITY_EMPTY', "{$at}/buildings");
        }
        $this->duplicates($buildings, 'id', "{$at}/buildings");
        $this->roles($buildings, "{$at}/buildings", $kind);
        $boxes = [];
        foreach ($buildings as $i => $b) {
            $p = "{$at}/buildings/{$i}";
            $this->color($b, $p);
            $this->positiveSize($b['size'], "{$p}/size");
            $this->radius($b, $p);
            $boxes[$i] = self::box($b['position'], $b['size']);
        }
        if (!($half > 0)) {
            $this->add('HALFSIZE_NOT_POSITIVE', "{$at}/halfSize");
        }
        foreach ($boxes as $i => $f) {
            if (self::outside($f, $half)) {
                $this->add('OUT_OF_MAP', "{$at}/buildings/{$i}");
            }
        }
        $s = $c['spawn'];
        if (abs((float) $s['x']) >= $half || abs((float) $s['z']) >= $half) {
            $this->add('SPAWN_OUT_OF_MAP', "{$at}/spawn");
        } else {
            foreach ($boxes as $f) {
                if (self::contains($f, (float) $s['x'], (float) $s['z'])) {
                    $this->add('SPAWN_INSIDE_BUILDING', "{$at}/spawn");
                    break;
                }
            }
        }
        $n = count($boxes);
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                if (self::touches($boxes[$i], $boxes[$j])) {
                    $this->add('BUILDINGS_OVERLAP', "{$at}/buildings/{$j}");
                }
            }
        }

        $npcs = $c['npcs'] ?? [];
        $this->duplicates($npcs, 'id', "{$at}/npcs");
        $npcBoxes = [];
        foreach ($npcs as $i => $npc) {
            $p = "{$at}/npcs/{$i}";
            if (preg_match(self::PERSONA, $npc['persona']) !== 1) {
                $this->add('NPC_PERSONA_INVALID', "{$p}/persona");
            }
            $this->color($npc, $p);
            $this->radius($npc, $p);
            $r = self::NPC_BODY_RADIUS;
            $f = self::box($npc['position'], [2 * $r, 0, 2 * $r]);
            if (self::outside($f, $half)) {
                $this->add('OUT_OF_MAP', $p);
            }
            foreach ($boxes as $g) {
                if (self::touches($f, $g)) {
                    $this->add('NPC_INSIDE_BUILDING', $p);
                    break;
                }
            }
            foreach ($npcBoxes as $g) {
                if (self::touches($f, $g)) {
                    $this->add('NPC_OVER_NPC', $p);
                    break;
                }
            }
            if (self::contains($f, (float) $s['x'], (float) $s['z'])) {
                $this->add('NPC_ON_SPAWN', $p);
            }
            $npcBoxes[] = $f;
        }

        $this->interiorsRules($c['interiors'] ?? [], $c, $at, $quests);
    }

    /**
     * Os papéis: cada um no máximo uma vez, só os do tipo da cidade, e todos os obrigatórios presentes.
     *
     * @param list<array<string, mixed>> $buildings
     */
    private function roles(array $buildings, string $at, string $kind): void
    {
        $all = array_merge(...array_values(self::REQUIRED_ROLES));
        $seen = [];
        foreach ($buildings as $i => $b) {
            if (!array_key_exists('role', $b)) {
                continue;
            }
            $role = $b['role'];
            $p = "{$at}/{$i}/role";
            if (!in_array($role, $all, true)) {
                $this->add('ROLE_UNKNOWN', $p);
            } elseif (!in_array($role, self::REQUIRED_ROLES[$kind], true)) {
                $this->add('ROLE_NOT_ALLOWED', $p, $role);
            } elseif (isset($seen[$role])) {
                $this->add('ROLE_DUPLICATE', $p, $role);
            }
            $seen[$role] = true;
        }
        foreach (self::REQUIRED_ROLES[$kind] as $role) {
            if (!isset($seen[$role])) {
                $this->add('ROLE_MISSING', $at, $role);
            }
        }
    }

    /** @param list<string> $attributes */
    private function attributesRules(array $attributes): void
    {
        $seen = [];
        foreach ($attributes as $i => $a) {
            if (isset($seen[$a])) {
                $this->add('ID_DUPLICATE', "/attributes/{$i}");
            }
            $seen[$a] = true;
        }
    }

    /**
     * A escada do curso: começa em 0 XP, o XP cresce, e os requisitos apontam para atributos e fases do curso.
     *
     * @param list<array<string, mixed>> $levels
     * @param list<string> $attributes
     * @param list<string> $phaseIds
     */
    private function levelsRules(array $levels, array $attributes, array $phaseIds): void
    {
        if ($levels === []) {
            $this->add('LEVELS_EMPTY', '/levels');
            return;
        }
        if ((float) $levels[0]['minXp'] !== 0.0) {
            $this->add('LEVEL_FIRST_NOT_ZERO', '/levels/0/minXp');
        }
        for ($i = 1, $n = count($levels); $i < $n; $i++) {
            if (!((float) $levels[$i]['minXp'] > (float) $levels[$i - 1]['minXp'])) {
                $this->add('LEVEL_XP_NOT_INCREASING', "/levels/{$i}/minXp");
            }
        }
        $this->duplicates($levels, 'id', '/levels');
        foreach ($levels as $i => $l) {
            foreach (array_keys($l['minAttributes'] ?? []) as $a) {
                if (!in_array((string) $a, $attributes, true)) {
                    $this->add('ATTRIBUTE_UNKNOWN', "/levels/{$i}/minAttributes/" . self::pointer((string) $a));
                }
            }
            foreach ($l['requiredPhases'] ?? [] as $k => $phase) {
                if (!in_array($phase, $phaseIds, true)) {
                    $this->add('PHASE_UNKNOWN', "/levels/{$i}/requiredPhases/{$k}");
                }
            }
        }
    }

    /**
     * As fases: ids únicos, pré-requisitos que existem e sem ciclo (sempre há por onde começar), a cidade de cada
     * fase, e as missões com id único no CURSO inteiro (o progresso guarda curso + missão).
     *
     * @param list<array<string, mixed>> $phases
     * @param list<string> $attributes
     */
    private function phasesRules(array $phases, array $attributes): void
    {
        if ($phases === []) {
            $this->add('PHASES_EMPTY', '/phases');
            return;
        }
        $this->duplicates($phases, 'id', '/phases');
        $ids = array_column($phases, 'id');
        $graph = [];
        foreach ($phases as $i => $f) {
            $graph[$f['id']] ??= [];
            foreach ($f['requires'] as $k => $req) {
                $p = "/phases/{$i}/requires/{$k}";
                if ($req === $f['id']) {
                    $this->add('PHASE_REQUIRES_SELF', $p);
                } elseif (!in_array($req, $ids, true)) {
                    $this->add('PHASE_UNKNOWN', $p);
                } else {
                    $graph[$f['id']][] = $req;
                }
            }
        }
        foreach (self::inCycle($graph) as $id) {
            $this->add('PHASE_CYCLE', '/phases/' . array_search($id, $ids, true) . '/requires');
        }

        $questIds = [];
        foreach ($phases as $i => $f) {
            $at = "/phases/{$i}";
            $buildingIds = array_column($f['city']['buildings'], 'id');
            foreach ($f['quests'] as $k => $q) {
                $qp = "{$at}/quests/{$k}";
                if (isset($questIds[$q['id']])) {
                    $this->add('ID_DUPLICATE', "{$qp}/id");
                }
                $questIds[$q['id']] = true;
                if (!in_array($q['buildingId'], $buildingIds, true)) {
                    $this->add('QUEST_BUILDING_UNKNOWN', "{$qp}/buildingId");
                }
                // Inteiro e positivo: o XP do servidor (ServerQuestCatalog) só soma inteiros.
                if (!is_int($q['rewardXp']) || $q['rewardXp'] <= 0) {
                    $this->add('XP_NOT_POSITIVE', "{$qp}/rewardXp");
                }
                foreach (array_keys($q['attributes'] ?? []) as $a) {
                    if (!in_array((string) $a, $attributes, true)) {
                        $this->add('ATTRIBUTE_UNKNOWN', "{$qp}/attributes/" . self::pointer((string) $a));
                    }
                }
            }
            $this->cityRules($f['city'], "{$at}/city", 'phase', $f['quests']);
        }
    }

    /**
     * Espelha validateInteriors do domínio: a sala é um mini-campus com a porta na parede sul (+z).
     *
     * @param list<array<string, mixed>> $interiors
     * @param array<string, mixed> $city
     * @param list<array<string, mixed>> $quests
     */
    private function interiorsRules(array $interiors, array $city, string $cityAt, array $quests): void
    {
        $r = self::AVATAR_RADIUS;
        $seen = [];
        $questBuilding = [];
        foreach ($quests as $q) {
            $questBuilding[$q['id']] ??= $q['buildingId'];
        }
        $obstacles = array_merge(
            array_map(static fn (array $b): array => self::box($b['position'], $b['size']), $city['buildings']),
            array_map(static fn (array $n): array => self::box($n['position'], [2 * self::NPC_BODY_RADIUS, 0, 2 * self::NPC_BODY_RADIUS]), $city['npcs'] ?? []),
        );
        foreach ($interiors as $i => $it) {
            $p = "{$cityAt}/interiors/{$i}";
            $building = null;
            foreach ($city['buildings'] as $b) {
                if ($b['id'] === $it['buildingId']) {
                    $building = $b;
                    break;
                }
            }
            if ($building === null) {
                $this->add('INTERIOR_BUILDING_UNKNOWN', "{$p}/buildingId");
                continue;
            }
            if (isset($seen[$it['buildingId']])) {
                $this->add('INTERIOR_DUPLICATE', "{$p}/buildingId");
            }
            $seen[$it['buildingId']] = true;
            $half = (float) $it['halfSize'];
            $door = (float) $it['doorX'];
            if (!($half >= 3 && $half <= 15)) {
                $this->add('INTERIOR_HALFSIZE_RANGE', "{$p}/halfSize");
            }
            if (abs($door) > $half - self::DOOR_HALF_WIDTH - 0.5) {
                $this->add('INTERIOR_DOOR_OUTSIDE', "{$p}/doorX");
            }
            $stationQuests = array_column($it['stations'], 'questId');
            foreach ($quests as $q) {
                if ($q['buildingId'] === $it['buildingId'] && !in_array($q['id'], $stationQuests, true)) {
                    $this->add('INTERIOR_QUEST_WITHOUT_STATION', "{$p}/stations", $q['id']);
                }
            }
            $boxes = array_map(static fn (array $s): array => self::box($s['position'], $s['size']), $it['stations']);
            $spawnX = $door;
            $spawnZ = $half - self::ENTRY_DEPTH;
            foreach ($it['stations'] as $k => $s) {
                $sp = "{$p}/stations/{$k}";
                if (!isset($questBuilding[$s['questId']])) {
                    $this->add('STATION_QUEST_UNKNOWN', "{$sp}/questId");
                } elseif ($questBuilding[$s['questId']] !== $it['buildingId']) {
                    $this->add('STATION_QUEST_OTHER_BUILDING', "{$sp}/questId");
                }
                if (array_search($s['questId'], $stationQuests, true) !== $k) {
                    $this->add('STATION_DUPLICATE', "{$sp}/questId");
                }
                $this->color($s, $sp);
                $this->positiveSize($s['size'], "{$sp}/size");
                $f = $boxes[$k];
                if (self::outside($f, $half)) {
                    $this->add('STATION_OUTSIDE_WALLS', $sp);
                }
                for ($m = $k + 1, $n = count($boxes); $m < $n; $m++) {
                    if (self::touches($f, $boxes[$m])) {
                        $this->add('STATIONS_OVERLAP', "{$p}/stations/{$m}");
                    }
                }
                if (self::distance($f, $spawnX, $spawnZ) < $r + 1) {
                    $this->add('STATION_BLOCKS_DOOR', $sp);
                }
            }
            $outX = (float) $building['position'][0];
            $outZ = (float) $building['position'][1] + (float) $building['size'][2] / 2 + self::EXIT_OFFSET;
            $limit = (float) $city['halfSize'] - $r;
            $blocked = false;
            foreach ($obstacles as $f) {
                if (self::circleTouches($outX, $outZ, $r, $f)) {
                    $blocked = true;
                    break;
                }
            }
            if (abs($outX) > $limit || abs($outZ) > $limit || $blocked) {
                $this->add('INTERIOR_EXIT_BLOCKED', $p);
            }
        }
    }

    /** @param array<string, array<string, string>> $texts */
    private function textsRules(array $texts): void
    {
        $sets = [];
        foreach (self::LOCALES as $locale) {
            $sets[$locale] = array_map('strval', array_keys($texts[$locale]));
            foreach ($texts[$locale] as $key => $text) {
                $p = '/texts/' . self::pointer($locale) . '/' . self::pointer((string) $key);
                if (preg_match(self::TEXT_KEY, (string) $key) !== 1) {
                    $this->add('TEXT_KEY_INVALID', $p);
                }
                if (trim($text) === '') {
                    $this->add('TEXT_EMPTY', $p);
                } elseif (mb_strlen($text) > self::MAX_TEXT_LENGTH) {
                    $this->add('TEXT_TOO_LONG', $p);
                }
            }
        }
        // Paridade: as duas línguas com as mesmas chaves, e toda chave usada pelo conteúdo presente nas duas.
        foreach (self::LOCALES as $locale) {
            foreach (self::LOCALES as $other) {
                if ($other === $locale) {
                    continue;
                }
                foreach (array_diff($sets[$locale], $sets[$other]) as $key) {
                    $this->add('TEXT_KEYS_MISMATCH', '/texts/' . self::pointer($other) . '/' . self::pointer($key));
                }
            }
        }
        foreach ($this->usedKeys as $key => $where) {
            foreach (self::LOCALES as $locale) {
                if (!in_array((string) $key, $sets[$locale], true)) {
                    $this->add('TEXT_KEY_MISSING', $where);
                    break;
                }
            }
        }
    }

    // ------------------------------------------------------------------ apoio

    private function add(string $code, string $path, ?string $param = null): void
    {
        $this->problems[] = new Problem($code, $path, $param);
    }

    private function missing(mixed $value, string $at): bool
    {
        $this->add($value === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', $at);
        return false;
    }

    /** @param array<string, mixed> $o */
    private function number(array $o, string $field, string $at): bool
    {
        $v = $o[$field] ?? null;
        if ((is_int($v) || is_float($v)) && is_finite((float) $v)) {
            return true;
        }
        return $this->missing($v, "{$at}/{$field}");
    }

    /** @param array<string, mixed> $o */
    private function string(array $o, string $field, string $at): bool
    {
        $v = $o[$field] ?? null;
        if (is_string($v) && trim($v) !== '' && strlen($v) <= 120) {
            return true;
        }
        $this->add($v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', "{$at}/{$field}");
        return false;
    }

    /** @param array<string, mixed> $o */
    private function id(array $o, string $field, string $at): bool
    {
        if (!$this->string($o, $field, $at)) {
            return false;
        }
        if (preg_match(self::ID, $o[$field]) !== 1) {
            $this->add('ID_INVALID', "{$at}/{$field}");
            return false;
        }
        return true;
    }

    /** Lista de ids (pré-requisitos, fases exigidas). */
    private function idList(array $o, string $field, string $at): bool
    {
        return $this->list($o, $field, $at, self::MAX_PHASES, function (mixed $v, string $p): bool {
            if (is_string($v) && preg_match(self::ID, $v) === 1) {
                return true;
            }
            $this->add(is_string($v) ? 'ID_INVALID' : 'FIELD_TYPE', $p);
            return false;
        });
    }

    /** Mapa atributo => pontos inteiros (>= $min). */
    private function points(array $o, string $field, string $at, int $min): bool
    {
        $v = $o[$field];
        if (!self::isObject($v)) {
            return $this->missing($v, "{$at}/{$field}");
        }
        $ok = true;
        foreach ($v as $attr => $n) {
            if (!is_int($n) || $n < $min) {
                $this->add('ATTRIBUTE_POINTS_INVALID', "{$at}/{$field}/" . self::pointer((string) $attr));
                $ok = false;
            }
        }
        return $ok;
    }

    /** "locked" (só nos documentos da plataforma): booleano, se presente. */
    private function locked(array $o, string $at): bool
    {
        if (array_key_exists('locked', $o) && !is_bool($o['locked'])) {
            $this->add('FIELD_TYPE', "{$at}/locked");
            return false;
        }
        return true;
    }

    /** Chave de texto: formato e registro de uso (a paridade é conferida no fim). */
    private function textKey(array $o, string $field, string $at): bool
    {
        if (!$this->string($o, $field, $at)) {
            return false;
        }
        if (preg_match(self::TEXT_KEY, $o[$field]) !== 1) {
            $this->add('TEXT_KEY_INVALID', "{$at}/{$field}");
            return false;
        }
        $this->usedKeys[$o[$field]] ??= "{$at}/{$field}";
        return true;
    }

    /** @param array<string, mixed> $o */
    private function tuple(array $o, string $field, int $size, string $at): bool
    {
        $v = $o[$field] ?? null;
        if (is_array($v) && array_is_list($v) && count($v) === $size) {
            $ok = true;
            foreach ($v as $n) {
                $ok = $ok && (is_int($n) || is_float($n)) && is_finite((float) $n);
            }
            if ($ok) {
                return true;
            }
        }
        $this->add($v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', "{$at}/{$field}");
        return false;
    }

    /** @param callable(mixed, string): bool $item */
    private function list(array $o, string $field, string $at, int $max, callable $item): bool
    {
        return $this->listAt($o[$field] ?? null, "{$at}/{$field}", $max, $item);
    }

    /** @param callable(mixed, string): bool $item */
    private function listAt(mixed $v, string $at, int $max, callable $item): bool
    {
        if (!is_array($v) || !array_is_list($v)) {
            return $this->missing($v, $at);
        }
        if (count($v) > $max) {
            $this->add('TOO_MANY', $at);
            return false;
        }
        $ok = true;
        foreach ($v as $i => $e) {
            $ok = $item($e, "{$at}/{$i}") && $ok;
        }
        return $ok;
    }

    /** @param list<array<string, mixed>> $items */
    private function duplicates(array $items, string $field, string $at): void
    {
        $seen = [];
        foreach ($items as $i => $e) {
            if (isset($seen[$e[$field]])) {
                $this->add('ID_DUPLICATE', "{$at}/{$i}/{$field}");
            }
            $seen[$e[$field]] = true;
        }
    }

    /** @param array<string, mixed> $e */
    private function color(array $e, string $at): void
    {
        if (preg_match(self::HEX_COLOR, $e['color']) !== 1) {
            $this->add('COLOR_INVALID', "{$at}/color");
        }
    }

    /** @param list<int|float> $size */
    private function positiveSize(array $size, string $at): void
    {
        foreach ($size as $n) {
            if (!($n > 0)) {
                $this->add('SIZE_NOT_POSITIVE', $at);
                return;
            }
        }
    }

    /** @param array<string, mixed> $e */
    private function radius(array $e, string $at): void
    {
        if (array_key_exists('interactionRadius', $e) && !($e['interactionRadius'] > 0)) {
            $this->add('RADIUS_NOT_POSITIVE', "{$at}/interactionRadius");
        }
    }

    /**
     * As fases que estão num ciclo de pré-requisitos (nunca liberariam), na ordem do documento. Remove, uma a uma, as
     * fases cujos pré-requisitos já saíram (Kahn); o que sobrar está num ciclo ou depende de um.
     *
     * @param array<string, list<string>> $graph fase => pré-requisitos
     * @return list<string>
     */
    private static function inCycle(array $graph): array
    {
        $left = $graph;
        do {
            $removed = false;
            foreach ($left as $id => $reqs) {
                if (array_intersect($reqs, array_keys($left)) === []) {
                    unset($left[$id]);
                    $removed = true;
                }
            }
        } while ($removed);
        return array_map('strval', array_keys($left));
    }

    public static function isObject(mixed $v): bool
    {
        return is_array($v) && ($v === [] || !array_is_list($v));
    }

    /** Escapa um segmento de JSON Pointer (RFC 6901). */
    public static function pointer(string $segment): string
    {
        return str_replace(['~', '/'], ['~0', '~1'], $segment);
    }

    /**
     * @param list<int|float> $position
     * @param list<int|float> $size
     * @return array{float, float, float, float} minX, maxX, minZ, maxZ
     */
    private static function box(array $position, array $size): array
    {
        $x = (float) $position[0];
        $z = (float) $position[1];
        return [$x - $size[0] / 2, $x + $size[0] / 2, $z - $size[2] / 2, $z + $size[2] / 2];
    }

    /** @param array{float, float, float, float} $f */
    private static function outside(array $f, float $half): bool
    {
        return $f[0] < -$half || $f[1] > $half || $f[2] < -$half || $f[3] > $half;
    }

    /** @param array{float, float, float, float} $f */
    private static function contains(array $f, float $x, float $z): bool
    {
        return $x > $f[0] && $x < $f[1] && $z > $f[2] && $z < $f[3];
    }

    /** Retângulos que se cruzam (encostar não conta). */
    private static function touches(array $a, array $c): bool
    {
        return $a[0] < $c[1] && $c[0] < $a[1] && $a[2] < $c[3] && $c[2] < $a[3];
    }

    private static function circleTouches(float $x, float $z, float $r, array $f): bool
    {
        return $x + $r > $f[0] && $x - $r < $f[1] && $z + $r > $f[2] && $z - $r < $f[3];
    }

    private static function distance(array $f, float $x, float $z): float
    {
        return hypot(max($f[0] - $x, 0, $x - $f[1]), max($f[2] - $z, 0, $z - $f[3]));
    }
}
