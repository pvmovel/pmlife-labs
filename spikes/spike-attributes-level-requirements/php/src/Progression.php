<?php
declare(strict_types=1);

// Espelho em PHP do src/Domain (as mesmas regras, os mesmos códigos): o servidor recalcula XP, atributos, nível e
// fases pelo documento do curso e nunca aceita o número de quem chama (ADR-008). O php/verify.php roda os mesmos
// casos de conformidade do TypeScript.

namespace Spike\Progression;

/** Quanto uma missão concluída vale (Open/Closed: a nota proporcional é outra implementação). */
interface QuestScoring
{
    /** @return array{xp: int|float, attributes: array<string, int|float>} */
    public function score(array $quest): array;
}

final class FixedScoring implements QuestScoring
{
    public function score(array $quest): array
    {
        return ['xp' => $quest['rewardXp'], 'attributes' => $quest['attributes'] ?? []];
    }
}

/**
 * O progresso de um aluno num curso, derivado das conclusões (cada uma com a versão em que valeu).
 * - cada missão vale os pontos da sua versão; a fase em andamento fica na versão em que começou;
 * - a fase está concluída quando todas as missões dela, na versão dela, foram feitas;
 * - a escada é a da versão atual, em ordem.
 */
final class CourseProgress
{
    private int $latest;
    /** @var array<string, int> fase => versão */
    private array $pinned = [];

    /**
     * @param array<int, array> $history versão => documento
     * @param list<array{questId: string, version: int}> $completions
     */
    public function __construct(private array $history, public readonly array $completions, private QuestScoring $scoring = new FixedScoring())
    {
        if ($history === []) {
            throw new \InvalidArgumentException('curso sem versões');
        }
        $this->latest = max(array_keys($history));
        foreach ($completions as $c) {
            $phase = isset($history[$c['version']]) ? self::phaseOfQuest($history[$c['version']], $c['questId']) : null;
            if ($phase === null) {
                continue;
            }
            $v = $this->pinned[$phase['id']] ?? null;
            if ($v === null || $c['version'] < $v) {
                $this->pinned[$phase['id']] = $c['version'];
            }
        }
    }

    public function current(): array
    {
        return $this->doc($this->latest);
    }

    public function xp(): int|float
    {
        return array_sum(array_map(static fn (array $s) => $s['xp'], $this->scores()));
    }

    /** @return array<string, int|float> */
    public function attributes(): array
    {
        $total = array_fill_keys($this->current()['attributes'], 0);
        foreach ($this->scores() as $s) {
            foreach ($s['attributes'] as $a => $n) {
                $total[$a] = ($total[$a] ?? 0) + $n;
            }
        }
        return $total;
    }

    public function phaseVersion(string $phaseId): ?int
    {
        return $this->pinned[$phaseId] ?? null;
    }

    public function isConcluded(string $phaseId): bool
    {
        $v = $this->pinned[$phaseId] ?? null;
        $phase = $v === null ? null : self::phase($this->doc($v), $phaseId);
        if ($phase === null) {
            return false;
        }
        $done = array_column($this->completions, 'questId');
        foreach ($phase['quests'] as $q) {
            if (!in_array($q['id'], $done, true)) {
                return false;
            }
        }
        return true;
    }

    /** @return list<array{id: string, status: string, version: int, missingPhases: list<string>}> */
    public function phases(): array
    {
        $views = array_map(fn (array $p) => $this->view($p), $this->current()['phases']);
        $ids = array_column($views, 'id');
        foreach ($this->pinned as $id => $v) {
            $phase = in_array($id, $ids, true) ? null : self::phase($this->doc($v), $id);
            if ($phase !== null) {
                $views[] = $this->view($phase);
            }
        }
        return $views;
    }

    /** @return array{current: array, next: ?array{level: array, missing: array}} */
    public function level(): array
    {
        $levels = $this->current()['levels'];
        $current = $levels[0];
        for ($i = 1; $i < count($levels); $i++) {
            $missing = $this->missingFor($levels[$i]);
            if ($missing['xp'] > 0 || $missing['attributes'] !== [] || $missing['phases'] !== []) {
                return ['current' => $current, 'next' => ['level' => $levels[$i], 'missing' => $missing]];
            }
            $current = $levels[$i];
        }
        return ['current' => $current, 'next' => null];
    }

    /** @return array{ok: true, completion: array{questId: string, version: int}}|array{ok: false, code: string} */
    public function attempt(string $questId): array
    {
        if (in_array($questId, array_column($this->completions, 'questId'), true)) {
            return ['ok' => false, 'code' => 'ALREADY_COMPLETED'];
        }
        foreach ($this->pinned as $phaseId => $v) {
            $phase = self::phase($this->doc($v), (string) $phaseId);
            if ($phase === null || !in_array($questId, array_column($phase['quests'], 'id'), true)) {
                continue;
            }
            if ($this->isConcluded((string) $phaseId)) {
                return ['ok' => false, 'code' => 'PHASE_CONCLUDED'];
            }
            return ['ok' => true, 'completion' => ['questId' => $questId, 'version' => $v]];
        }
        $phase = self::phaseOfQuest($this->current(), $questId);
        if ($phase === null) {
            return ['ok' => false, 'code' => 'QUEST_UNKNOWN'];
        }
        if (isset($this->pinned[$phase['id']])) {
            return ['ok' => false, 'code' => $this->isConcluded($phase['id']) ? 'PHASE_CONCLUDED' : 'QUEST_NOT_IN_PHASE_VERSION'];
        }
        if ($this->missingPhases($phase) !== []) {
            return ['ok' => false, 'code' => 'PHASE_LOCKED'];
        }
        return ['ok' => true, 'completion' => ['questId' => $questId, 'version' => $this->latest]];
    }

    /** @param array{questId: string, version: int} $completion */
    public function with(array $completion): self
    {
        return new self($this->history, [...$this->completions, $completion], $this->scoring);
    }

    public function withHistory(array $history): self
    {
        return new self($history, $this->completions, $this->scoring);
    }

    private function view(array $phase): array
    {
        $v = $this->pinned[$phase['id']] ?? null;
        if ($v !== null) {
            return ['id' => $phase['id'], 'status' => $this->isConcluded($phase['id']) ? 'concluded' : 'in-progress', 'version' => $v, 'missingPhases' => []];
        }
        $missing = $this->missingPhases($phase);
        return ['id' => $phase['id'], 'status' => $missing === [] ? 'open' : 'locked', 'version' => $this->latest, 'missingPhases' => $missing];
    }

    /** @return list<string> */
    private function missingPhases(array $phase): array
    {
        return array_values(array_filter($phase['requires'], fn (string $id) => !$this->isConcluded($id)));
    }

    private function missingFor(array $level): array
    {
        $have = $this->attributes();
        $attributes = [];
        foreach ($level['minAttributes'] ?? [] as $a => $min) {
            $gap = $min - ($have[$a] ?? 0);
            if ($gap > 0) {
                $attributes[$a] = $gap;
            }
        }
        return [
            'xp' => max(0, $level['minXp'] - $this->xp()),
            'attributes' => $attributes,
            'phases' => array_values(array_filter($level['requiredPhases'] ?? [], fn (string $id) => !$this->isConcluded($id))),
        ];
    }

    private function scores(): array
    {
        $out = [];
        foreach ($this->completions as $c) {
            foreach ($this->history[$c['version']]['phases'] ?? [] as $p) {
                foreach ($p['quests'] as $q) {
                    if ($q['id'] === $c['questId']) {
                        $out[] = $this->scoring->score($q);
                    }
                }
            }
        }
        return $out;
    }

    private function doc(int $version): array
    {
        return $this->history[$version] ?? throw new \RuntimeException("versão {$version} inexistente");
    }

    private static function phase(array $doc, string $id): ?array
    {
        foreach ($doc['phases'] as $p) {
            if ($p['id'] === $id) {
                return $p;
            }
        }
        return null;
    }

    private static function phaseOfQuest(array $doc, string $questId): ?array
    {
        foreach ($doc['phases'] as $p) {
            if (in_array($questId, array_column($p['quests'], 'id'), true)) {
                return $p;
            }
        }
        return null;
    }
}

/** Regras da instituição: catálogo de atributos, total somando os cursos e o aviso antes de publicar. */
final class Institution
{
    /** @return list<array{code: string, path: string}> */
    public static function checkAttributes(array $doc, array $catalog): array
    {
        $out = [];
        foreach ($doc['attributes'] as $i => $a) {
            if (!in_array($a, $catalog, true)) {
                $out[] = ['code' => 'ATTRIBUTE_NOT_IN_CATALOG', 'path' => "/attributes/{$i}"];
            }
        }
        return $out;
    }

    /** @param list<CourseProgress> $enrollments */
    public static function total(array $enrollments): array
    {
        $attributes = [];
        foreach ($enrollments as $e) {
            foreach ($e->attributes() as $a => $n) {
                $attributes[$a] = ($attributes[$a] ?? 0) + $n;
            }
        }
        return ['xp' => array_sum(array_map(static fn (CourseProgress $e) => $e->xp(), $enrollments)), 'attributes' => $attributes];
    }

    /**
     * @param array<string, CourseProgress> $students
     * @return list<array{student: string, from: string, to: string}>
     */
    public static function publishImpact(array $history, array $next, array $students): array
    {
        $after = $history;
        $after[max(array_keys($history)) + 1] = $next;
        $rank = static fn (string $id) => array_search($id, array_column($next['levels'], 'id'), true);
        $out = [];
        foreach ($students as $student => $progress) {
            $before = $progress->level()['current']['id'];
            $now = $progress->withHistory($after)->level()['current']['id'];
            if ($rank($before) === false || $rank($now) < $rank($before)) {
                $out[] = ['student' => (string) $student, 'from' => $before, 'to' => $now];
            }
        }
        return $out;
    }
}

/** A fila offline: o servidor tenta cada missão, em ordem, e decide a versão. */
final class OfflineSync
{
    /** @return array{progress: CourseProgress, accepted: list<array{questId: string, version: int}>, rejected: list<array{questId: string, code: string}>} */
    public static function applyQueue(CourseProgress $server, array $queue): array
    {
        $progress = $server;
        $accepted = [];
        $rejected = [];
        foreach ($queue as $questId) {
            $a = $progress->attempt($questId);
            if ($a['ok']) {
                $progress = $progress->with($a['completion']);
                $accepted[] = $a['completion'];
            } else {
                $rejected[] = ['questId' => $questId, 'code' => $a['code']];
            }
        }
        return ['progress' => $progress, 'accepted' => $accepted, 'rejected' => $rejected];
    }
}
