<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

use RuntimeException;

/**
 * Converte uma trilha no formato de hoje (buildings, interiors, levels, quests e npcs em arquivos separados, com os
 * textos nos arquivos de idioma do app) num curso-modelo do ADR-012:
 *
 * - o id do curso é o id da trilha ("dev-to-pm" continua "dev-to-pm"), e as missões mantêm id e XP: o progresso já
 *   gravado (curso + missão) continua valendo, sem migrar uma linha do banco;
 * - a cidade de hoje vira a fase 1, sem pré-requisitos;
 * - a cidade do curso nasce só com os prédios obrigatórios (Portal das fases e Mural), travados;
 * - as missões migradas ficam travadas: num curso vinculado, a instituição acrescenta, mas não muda o XP do modelo;
 * - nenhum conteúdo novo além das chaves dos prédios obrigatórios.
 */
final class LegacyTrackMigration
{
    public const PHASE_ID = 'fase-1';

    /**
     * @param array<string, array<string, mixed>> $files "buildings", "interiors", "levels", "quests" e "npcs" (decodificados)
     * @param array<string, array<string, string>> $locales textos do app por idioma (só as chaves usadas são levadas)
     * @param array<string, array<string, string>> $newTexts textos novos (curso, fase e prédios obrigatórios) por idioma
     * @return array<string, mixed> o curso, que ainda passa pelo DocumentValidator
     */
    public static function migrate(array $files, array $locales, array $newTexts, string $titleKey): array
    {
        $trackId = $files['buildings']['trackId'] ?? null;
        foreach ($files as $name => $file) {
            if (($file['trackId'] ?? null) !== $trackId) {
                throw new RuntimeException("{$name}.json é de outra trilha");
            }
        }
        $quests = array_map(static fn (array $q): array => $q + ['locked' => true], $files['quests']['quests']);
        $phaseCity = [
            'halfSize' => $files['buildings']['halfSize'],
            'spawn' => $files['buildings']['spawn'],
            'buildings' => $files['buildings']['buildings'],
            'npcs' => $files['npcs']['npcs'] ?? [],
            'interiors' => $files['interiors']['interiors'] ?? [],
        ];
        $course = [
            'schema' => DocumentValidator::SCHEMA,
            'kind' => 'course',
            'courseId' => $trackId,
            'titleKey' => $titleKey,
            'attributes' => [],
            'levels' => $files['levels']['levels'],
            'city' => [
                'halfSize' => 12,
                'spawn' => ['x' => 0, 'z' => 8, 'heading' => M_PI],
                'buildings' => [
                    ['id' => 'portal-fases', 'role' => 'phases-portal', 'labelKey' => 'course.buildings.phases-portal', 'position' => [-4, -3], 'size' => [4, 6, 4], 'color' => '#7c3aed', 'locked' => true],
                    ['id' => 'mural', 'role' => 'board', 'labelKey' => 'course.buildings.board', 'position' => [4, -3], 'size' => [4, 3, 2], 'color' => '#f59e0b', 'locked' => true],
                ],
            ],
            'phases' => [[
                'id' => self::PHASE_ID,
                'titleKey' => 'phases.' . self::PHASE_ID,
                'requires' => [],
                'city' => $phaseCity,
                'quests' => $quests,
            ]],
            'texts' => [],
        ];
        $used = self::usedKeys($course);
        foreach (DocumentValidator::LOCALES as $locale) {
            $texts = $newTexts[$locale] ?? [];
            foreach ($used as $key) {
                if (!isset($texts[$key]) && isset($locales[$locale][$key])) {
                    $texts[$key] = $locales[$locale][$key];
                }
            }
            ksort($texts);
            $course['texts'][$locale] = $texts;
        }
        return $course;
    }

    /** @return list<string> as chaves de texto citadas pelo curso (labelKey e titleKey em qualquer nível) */
    private static function usedKeys(array $node): array
    {
        $keys = [];
        foreach ($node as $k => $v) {
            if (($k === 'labelKey' || $k === 'titleKey') && is_string($v)) {
                $keys[] = $v;
            } elseif (is_array($v)) {
                array_push($keys, ...self::usedKeys($v));
            }
        }
        return array_values(array_unique($keys));
    }
}
