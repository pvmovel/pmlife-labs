// O progresso de um aluno num curso (uma matrícula), derivado só das missões concluídas (ADR-008: nada gravado em
// dobro). Regras decididas na US43:
// - cada missão vale os pontos da versão em que foi concluída: uma versão nova nunca tira nem dá pontos ao que já foi feito;
// - a fase em andamento fica na versão em que começou; a fase seguinte começa na versão atual;
// - a fase está concluída quando todas as missões dela, na versão dela, foram feitas;
// - a escada é a da versão atual, e o aluno sobe em ordem: para um nível, cumpre também os anteriores.
import {
  latestVersion,
  phaseOfQuest,
  type AttributePoints,
  type Completion,
  type CourseDoc,
  type CourseHistory,
  type LevelDoc,
  type PhaseDoc,
} from './CourseDocument';
import { fixedScoring, type QuestScoring } from './QuestScoring';

export type PhaseStatus = 'locked' | 'open' | 'in-progress' | 'concluded';

/** Como a fase aparece no Portal das fases. */
export interface PhaseView {
  readonly id: string;
  readonly status: PhaseStatus;
  /** A versão em que o aluno faz (ou fará) a fase. */
  readonly version: number;
  /** Bloqueada: as fases que faltam concluir (o motivo mostrado no Portal). */
  readonly missingPhases: readonly string[];
}

/** O que falta para um nível. */
export interface Missing {
  readonly xp: number;
  readonly attributes: AttributePoints;
  readonly phases: readonly string[];
}

export interface LevelStatus {
  readonly current: LevelDoc;
  /** O próximo degrau e o que falta, ou `null` no topo. */
  readonly next: { readonly level: LevelDoc; readonly missing: Missing } | null;
}

/** Por que uma conclusão foi recusada (o mesmo código no servidor). */
export type RejectCode = 'ALREADY_COMPLETED' | 'QUEST_UNKNOWN' | 'PHASE_LOCKED' | 'PHASE_CONCLUDED' | 'QUEST_NOT_IN_PHASE_VERSION';

export type Attempt = { readonly ok: true; readonly completion: Completion } | { readonly ok: false; readonly code: RejectCode };

export class CourseProgress {
  private readonly latest: number;
  private readonly pinned = new Map<string, number>();

  constructor(
    private readonly history: CourseHistory,
    readonly completions: readonly Completion[],
    private readonly scoring: QuestScoring = fixedScoring,
  ) {
    this.latest = latestVersion(history);
    // A versão da fase é a da primeira conclusão dela (a menor versão entre as conclusões da fase).
    for (const c of completions) {
      const doc = history.get(c.version);
      const phase = doc && phaseOfQuest(doc, c.questId);
      if (!phase) continue;
      const v = this.pinned.get(phase.id);
      if (v === undefined || c.version < v) this.pinned.set(phase.id, c.version);
    }
  }

  /** O documento da versão atual. */
  get current(): CourseDoc {
    return this.doc(this.latest);
  }

  /** XP total: a soma dos pontos de cada conclusão, na versão dela. */
  get xp(): number {
    return this.scores().reduce((sum, s) => sum + s.xp, 0);
  }

  /** Pontos por atributo do curso (os atributos sem pontos aparecem com 0). */
  get attributes(): AttributePoints {
    const total: Record<string, number> = Object.fromEntries(this.current.attributes.map((a) => [a, 0]));
    for (const s of this.scores()) for (const [a, n] of Object.entries(s.attributes)) total[a] = (total[a] ?? 0) + n;
    return total;
  }

  /** A versão em que a fase está sendo (ou foi) feita, ou `null` se ainda não começou. */
  phaseVersion(phaseId: string): number | null {
    return this.pinned.get(phaseId) ?? null;
  }

  /** Todas as missões da fase, na versão dela, foram concluídas. */
  isConcluded(phaseId: string): boolean {
    const v = this.pinned.get(phaseId);
    const phase = v === undefined ? undefined : this.doc(v).phases.find((p) => p.id === phaseId);
    if (!phase) return false;
    const done = new Set(this.completions.map((c) => c.questId));
    return phase.quests.every((q) => done.has(q.id));
  }

  /**
   * As fases do Portal: as da versão atual e, se uma versão nova tirou uma fase em andamento, também ela (o aluno
   * termina o que começou).
   */
  phases(): PhaseView[] {
    const views = this.current.phases.map((p) => this.view(p));
    for (const [id, v] of this.pinned) {
      if (views.some((x) => x.id === id)) continue;
      const phase = this.doc(v).phases.find((p) => p.id === id);
      if (phase) views.push(this.view(phase));
    }
    return views;
  }

  /** O nível pela escada da versão atual, em ordem, e o que falta para o próximo. */
  level(): LevelStatus {
    const levels = this.current.levels;
    let current = levels[0];
    for (let i = 1; i < levels.length; i++) {
      const missing = this.missingFor(levels[i]);
      if (!isEmpty(missing)) return { current, next: { level: levels[i], missing } };
      current = levels[i];
    }
    return { current, next: null };
  }

  /**
   * Tenta concluir uma missão. A versão é decidida aqui (no servidor, é ele quem decide): a da fase em andamento, ou
   * a atual para uma fase que ainda não começou.
   */
  attempt(questId: string): Attempt {
    if (this.completions.some((c) => c.questId === questId)) return { ok: false, code: 'ALREADY_COMPLETED' };
    // Numa fase já começada, vale a versão dela.
    for (const [phaseId, v] of this.pinned) {
      const phase = this.doc(v).phases.find((p) => p.id === phaseId);
      if (!phase?.quests.some((q) => q.id === questId)) continue;
      if (this.isConcluded(phaseId)) return { ok: false, code: 'PHASE_CONCLUDED' };
      return { ok: true, completion: { questId, version: v } };
    }
    const phase = phaseOfQuest(this.current, questId);
    if (!phase) return { ok: false, code: 'QUEST_UNKNOWN' };
    if (this.pinned.has(phase.id)) return { ok: false, code: this.isConcluded(phase.id) ? 'PHASE_CONCLUDED' : 'QUEST_NOT_IN_PHASE_VERSION' };
    if (this.missingPhases(phase).length > 0) return { ok: false, code: 'PHASE_LOCKED' };
    return { ok: true, completion: { questId, version: this.latest } };
  }

  /** O progresso depois de uma conclusão aceita. */
  with(completion: Completion): CourseProgress {
    return new CourseProgress(this.history, [...this.completions, completion], this.scoring);
  }

  /** O mesmo aluno com outra lista de versões (ex.: para ver o efeito de publicar uma versão nova). */
  withHistory(history: CourseHistory): CourseProgress {
    return new CourseProgress(history, this.completions, this.scoring);
  }

  private view(phase: PhaseDoc): PhaseView {
    const v = this.pinned.get(phase.id);
    if (v !== undefined) return { id: phase.id, status: this.isConcluded(phase.id) ? 'concluded' : 'in-progress', version: v, missingPhases: [] };
    const missingPhases = this.missingPhases(phase);
    return { id: phase.id, status: missingPhases.length > 0 ? 'locked' : 'open', version: this.latest, missingPhases };
  }

  private missingPhases(phase: PhaseDoc): string[] {
    return phase.requires.filter((id) => !this.isConcluded(id));
  }

  private missingFor(level: LevelDoc): Missing {
    const have = this.attributes;
    const attributes: Record<string, number> = {};
    for (const [a, min] of Object.entries(level.minAttributes ?? {})) {
      const gap = min - (have[a] ?? 0);
      if (gap > 0) attributes[a] = gap;
    }
    return {
      xp: Math.max(0, level.minXp - this.xp),
      attributes,
      phases: (level.requiredPhases ?? []).filter((id) => !this.isConcluded(id)),
    };
  }

  private scores() {
    return this.completions.flatMap((c) => {
      const quest = this.history.get(c.version)?.phases.flatMap((p) => p.quests).find((q) => q.id === c.questId);
      return quest ? [this.scoring.score(quest)] : [];
    });
  }

  private doc(version: number): CourseDoc {
    const doc = this.history.get(version);
    if (!doc) throw new Error(`versão ${version} inexistente`);
    return doc;
  }
}

function isEmpty(m: Missing): boolean {
  return m.xp === 0 && Object.keys(m.attributes).length === 0 && m.phases.length === 0;
}
