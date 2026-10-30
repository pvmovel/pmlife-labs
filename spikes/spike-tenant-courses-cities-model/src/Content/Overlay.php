<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

/**
 * A camada de uma instituição sobre um curso da plataforma vinculado (decisão do Pablo: acrescentar e ajustar o que
 * não está travado). A instituição guarda só a camada; o curso que o aluno vê é a mescla da versão adotada do
 * curso-modelo com ela, e a mescla passa pelo MESMO validador de um curso (DocumentValidator).
 *
 *   {
 *     "schema": 1, "kind": "overlay", "courseId": "campus-demo",
 *     "city":   { "add": {...}, "set": {...} },           a cidade do curso
 *     "phases": { "<id da fase>": { "add": {...}, "set": {...} } },
 *     "texts":  { "pt-BR": {...}, "en-US": {...} }        acrescenta ou troca textos
 *   }
 *   add: { "buildings": [...], "npcs": [...], "interiors": [...], "quests": [...] (só nas fases),
 *          "stations": { "<prédio>": [...] } }            estações a mais numa sala que já existe
 *   set: { "buildings": { "<id>": {campos} }, "npcs": {...}, "quests": {...} (só nas fases) }
 *
 * Open/Closed: a plataforma lança uma versão nova do curso e a camada continua valendo, porque aponta para ids, não
 * para posições na lista. O que não pode: mudar um item travado ("locked": true no curso-modelo), mudar um campo fora
 * da lista abaixo (id, papel, chave de texto), acrescentar fases ou remover qualquer coisa (para isso, a cópia).
 */
final class Overlay
{
    /** Campos que a camada pode trocar num item não travado. */
    public const SETTABLE = [
        'buildings' => ['position', 'size', 'color', 'interactionRadius'],
        'npcs' => ['position', 'color', 'interactionRadius'],
        'quests' => ['rewardXp', 'attributes'],
    ];
    private const ADDABLE = ['buildings', 'npcs', 'interiors', 'quests'];

    /** @var list<Problem> */
    private array $problems = [];

    /**
     * Mescla a camada sobre o curso. Problemas da camada (em caminhos da CAMADA) impedem a mescla; o chamador valida o
     * resultado com DocumentValidator (problemas em caminhos do CURSO MESCLADO).
     *
     * @param array<string, mixed> $course o curso-modelo (já válido)
     * @return array{array<string, mixed>|null, list<Problem>} [curso mesclado ou null, problemas da camada]
     */
    public static function apply(array $course, mixed $overlay): array
    {
        $o = new self();
        $merged = $o->merge($course, $overlay);
        return [$o->problems === [] ? $merged : null, $o->problems];
    }

    /** Uma camada vazia (o vínculo sem ajustes). */
    public static function empty(string $courseId): array
    {
        return ['schema' => 1, 'kind' => 'overlay', 'courseId' => $courseId];
    }

    private function merge(array $course, mixed $ov): array
    {
        if (!DocumentValidator::isObject($ov)) {
            $this->add('DOC_NOT_OBJECT', '');
            return $course;
        }
        if (($ov['schema'] ?? null) !== 1) {
            $this->add('SCHEMA_UNSUPPORTED', '/schema');
            return $course;
        }
        if (($ov['kind'] ?? null) !== 'overlay') {
            $this->add('KIND_UNSUPPORTED', '/kind');
            return $course;
        }
        if (($ov['courseId'] ?? null) !== $course['courseId']) {
            $this->add('OVERLAY_COURSE_MISMATCH', '/courseId');
            return $course;
        }
        foreach (array_keys($ov) as $key) {
            if (!in_array($key, ['schema', 'kind', 'courseId', 'city', 'phases', 'texts'], true)) {
                $this->add('OVERLAY_FIELD_NOT_ALLOWED', '/' . DocumentValidator::pointer((string) $key));
            }
        }
        if (array_key_exists('city', $ov)) {
            $course['city'] = $this->city($course['city'], [], $ov['city'], '/city', false)[0];
        }
        if (array_key_exists('phases', $ov)) {
            if (!DocumentValidator::isObject($ov['phases'])) {
                $this->add('FIELD_TYPE', '/phases');
            } else {
                $index = array_flip(array_column($course['phases'], 'id'));
                foreach ($ov['phases'] as $phaseId => $layer) {
                    $p = '/phases/' . DocumentValidator::pointer((string) $phaseId);
                    if (!isset($index[$phaseId])) {
                        $this->add('OVERLAY_TARGET_UNKNOWN', $p);
                        continue;
                    }
                    $phase = &$course['phases'][$index[$phaseId]];
                    [$phase['city'], $phase['quests']] = $this->city($phase['city'], $phase['quests'], $layer, $p, true);
                    unset($phase);
                }
            }
        }
        if (array_key_exists('texts', $ov)) {
            $this->texts($course, $ov['texts']);
        }
        return $course;
    }

    /**
     * Aplica add/set numa cidade (e nas missões, se for uma fase).
     *
     * @return array{array<string, mixed>, list<array<string, mixed>>}
     */
    private function city(array $city, array $quests, mixed $layer, string $at, bool $isPhase): array
    {
        if (!DocumentValidator::isObject($layer)) {
            $this->add('FIELD_TYPE', $at);
            return [$city, $quests];
        }
        foreach (array_keys($layer) as $key) {
            if ($key !== 'add' && $key !== 'set') {
                $this->add('OVERLAY_FIELD_NOT_ALLOWED', "{$at}/" . DocumentValidator::pointer((string) $key));
            }
        }
        $lists = ['buildings' => $city['buildings'], 'npcs' => $city['npcs'] ?? [], 'interiors' => $city['interiors'] ?? [], 'quests' => $quests];

        $set = $layer['set'] ?? [];
        if (!DocumentValidator::isObject($set)) {
            $this->add('FIELD_TYPE', "{$at}/set");
            $set = [];
        }
        foreach ($set as $collection => $changes) {
            $cp = "{$at}/set/" . DocumentValidator::pointer((string) $collection);
            if (!isset(self::SETTABLE[$collection]) || ($collection === 'quests' && !$isPhase)) {
                $this->add('OVERLAY_FIELD_NOT_ALLOWED', $cp);
                continue;
            }
            if (!DocumentValidator::isObject($changes)) {
                $this->add('FIELD_TYPE', $cp);
                continue;
            }
            foreach ($changes as $id => $fields) {
                $ip = "{$cp}/" . DocumentValidator::pointer((string) $id);
                $k = self::find($lists[$collection], (string) $id);
                if ($k === null) {
                    $this->add('OVERLAY_TARGET_UNKNOWN', $ip);
                    continue;
                }
                if (($lists[$collection][$k]['locked'] ?? false) === true) {
                    $this->add('OVERLAY_TARGET_LOCKED', $ip);
                    continue;
                }
                if (!DocumentValidator::isObject($fields) || $fields === []) {
                    $this->add('FIELD_TYPE', $ip);
                    continue;
                }
                foreach ($fields as $field => $value) {
                    if (!in_array($field, self::SETTABLE[$collection], true)) {
                        $this->add('OVERLAY_FIELD_NOT_ALLOWED', "{$ip}/" . DocumentValidator::pointer((string) $field));
                        continue;
                    }
                    $lists[$collection][$k][$field] = $value;
                }
            }
        }

        $add = $layer['add'] ?? [];
        if (!DocumentValidator::isObject($add)) {
            $this->add('FIELD_TYPE', "{$at}/add");
            $add = [];
        }
        foreach ($add as $collection => $items) {
            $cp = "{$at}/add/" . DocumentValidator::pointer((string) $collection);
            if ($collection === 'stations') {
                $this->stations($lists, $items, $cp);
                continue;
            }
            if (!in_array($collection, self::ADDABLE, true) || ($collection === 'quests' && !$isPhase)) {
                $this->add('OVERLAY_FIELD_NOT_ALLOWED', $cp);
                continue;
            }
            if (!is_array($items) || !array_is_list($items)) {
                $this->add('FIELD_TYPE', $cp);
                continue;
            }
            foreach ($items as $i => $item) {
                if (is_array($item) && array_key_exists('locked', $item)) {
                    // Travar é da plataforma: o que a instituição acrescenta ela mesma pode mudar.
                    $this->add('OVERLAY_FIELD_NOT_ALLOWED', "{$cp}/{$i}/locked");
                    continue;
                }
                $lists[$collection][] = $item;
            }
        }

        $city['buildings'] = $lists['buildings'];
        if ($lists['npcs'] !== [] || array_key_exists('npcs', $city)) {
            $city['npcs'] = $lists['npcs'];
        }
        if ($lists['interiors'] !== [] || array_key_exists('interiors', $city)) {
            $city['interiors'] = $lists['interiors'];
        }
        return [$city, $lists['quests']];
    }

    /** Estações a mais numa sala que já existe (para as missões novas num prédio da plataforma não travado). */
    private function stations(array &$lists, mixed $byBuilding, string $at): void
    {
        if (!DocumentValidator::isObject($byBuilding)) {
            $this->add('FIELD_TYPE', $at);
            return;
        }
        foreach ($byBuilding as $buildingId => $stations) {
            $bp = "{$at}/" . DocumentValidator::pointer((string) $buildingId);
            $b = self::find($lists['buildings'], (string) $buildingId);
            $k = null;
            foreach ($lists['interiors'] as $i => $it) {
                if (($it['buildingId'] ?? null) === $buildingId) {
                    $k = $i;
                    break;
                }
            }
            if ($b === null || $k === null) {
                $this->add('OVERLAY_TARGET_UNKNOWN', $bp);
                continue;
            }
            if (($lists['buildings'][$b]['locked'] ?? false) === true) {
                $this->add('OVERLAY_TARGET_LOCKED', $bp);
                continue;
            }
            if (!is_array($stations) || !array_is_list($stations)) {
                $this->add('FIELD_TYPE', $bp);
                continue;
            }
            array_push($lists['interiors'][$k]['stations'], ...$stations);
        }
    }

    /** Textos: a camada acrescenta chaves e troca o texto de qualquer chave (a paridade é do validador do curso). */
    private function texts(array &$course, mixed $texts): void
    {
        if (!DocumentValidator::isObject($texts)) {
            $this->add('FIELD_TYPE', '/texts');
            return;
        }
        foreach ($texts as $locale => $entries) {
            $p = '/texts/' . DocumentValidator::pointer((string) $locale);
            if (!in_array($locale, DocumentValidator::LOCALES, true)) {
                $this->add('OVERLAY_FIELD_NOT_ALLOWED', $p);
                continue;
            }
            if (!DocumentValidator::isObject($entries)) {
                $this->add('FIELD_TYPE', $p);
                continue;
            }
            foreach ($entries as $key => $text) {
                $course['texts'][$locale][(string) $key] = $text;
            }
        }
    }

    private static function find(array $items, string $id): ?int
    {
        foreach ($items as $k => $item) {
            if (is_array($item) && ($item['id'] ?? null) === $id) {
                return $k;
            }
        }
        return null;
    }

    private function add(string $code, string $path): void
    {
        $this->problems[] = new Problem($code, $path);
    }
}
