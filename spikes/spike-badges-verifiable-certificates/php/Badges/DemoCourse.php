<?php
declare(strict_types=1);

namespace Spike\Badges;

/**
 * O curso fictício da demo, como o documento do curso declararia: as fases, os atributos e as medalhas (no produto,
 * no JSON do curso, editado no admin). E as duas instituições fictícias que emitem.
 */
final class DemoCourse
{
    public const ID = 'dev-to-pm';
    public const TITLE = 'Dev a PM (curso de exemplo)';
    public const PHASES = ['fase-1' => 'Fase 1: o produto', 'fase-2' => 'Fase 2: os dados', 'fase-3' => 'Fase 3: a entrega'];
    public const ATTRIBUTES = ['comunicacao' => 'Comunicação', 'sql' => 'SQL'];
    public const TENANTS = [1 => 'Escola Aurora (fictícia)', 2 => 'Instituto Boreal (fictício)'];

    /** @return list<array<string, mixed>> */
    public static function badges(): array
    {
        return [
            ['id' => 'primeira-fase', 'titleKey' => 'badges.primeira', 'title' => 'Primeira fase', 'icon' => 'flag', 'criterion' => ['kind' => 'phase', 'phase' => 'fase-1']],
            ['id' => 'comunicador', 'titleKey' => 'badges.comunicador', 'title' => 'Comunicador (30 pontos)', 'icon' => 'star', 'criterion' => ['kind' => 'attribute', 'attribute' => 'comunicacao', 'min' => 30]],
            ['id' => 'analista', 'titleKey' => 'badges.analista', 'title' => 'Analista de dados (20 de SQL)', 'icon' => 'book', 'criterion' => ['kind' => 'attribute', 'attribute' => 'sql', 'min' => 20]],
            ['id' => 'formado', 'titleKey' => 'badges.formado', 'title' => 'Curso concluído', 'icon' => 'trophy', 'criterion' => ['kind' => 'course']],
        ];
    }

    /** @return list<string> */
    public static function phaseIds(): array
    {
        return array_keys(self::PHASES);
    }
}
