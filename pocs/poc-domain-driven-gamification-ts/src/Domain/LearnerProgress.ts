// Domain (TypeScript puro): progresso de um aprendiz em uma trilha.
// O nível NÃO é guardado: é sempre derivado do XP pela escada. Isso elimina o if/else
// de limiares; quando uma concessão cruza vários limiares, a promoção é registrada nível a nível.
import type { CareerLadder, CareerLevel } from './CareerLadder';

/** Formato serializável para persistir e reidratar (ex.: SQLite no navegador, API). */
export interface ProgressSnapshot {
  readonly learnerId: string;
  readonly trackId: string;
  readonly xp: number;
  readonly completedQuests: readonly string[];
}

/** Resultado de uma concessão de XP: de onde para onde o aprendiz foi, degrau a degrau. */
export interface Promotion {
  readonly from: CareerLevel;
  readonly to: CareerLevel;
  /** Cada nível alcançado, em ordem, sem pular nenhum (promoção nível a nível). */
  readonly promotions: readonly CareerLevel[];
  readonly levelsGained: number;
}

export class LearnerProgress {
  private xpTotal: number;
  private readonly quests: Set<string>;

  constructor(
    readonly learnerId: string,
    private readonly ladder: CareerLadder,
    initialXp = 0,
    completedQuests: readonly string[] = [],
  ) {
    if (learnerId.trim() === '') throw new Error('O id do aprendiz é obrigatório.');
    if (!Number.isFinite(initialXp) || initialXp < 0) throw new Error('O XP inicial não pode ser negativo.');
    this.xpTotal = initialXp;
    this.quests = new Set(completedQuests);
  }

  /** Reidrata a partir de um snapshot salvo, validando que ele é da mesma trilha. */
  static restore(snapshot: ProgressSnapshot, ladder: CareerLadder): LearnerProgress {
    if (snapshot.trackId !== ladder.trackId) {
      throw new Error(`Snapshot da trilha "${snapshot.trackId}" não pode ser restaurado na trilha "${ladder.trackId}".`);
    }
    return new LearnerProgress(snapshot.learnerId, ladder, snapshot.xp, snapshot.completedQuests);
  }

  get xp(): number {
    return this.xpTotal;
  }

  get level(): CareerLevel {
    return this.ladder.levelFor(this.xpTotal);
  }

  get nextLevel(): CareerLevel | null {
    return this.ladder.nextLevelFor(this.xpTotal);
  }

  get completedQuests(): readonly string[] {
    return [...this.quests];
  }

  /** Fração (0 a 1) do caminho entre o nível atual e o próximo; 1 no topo. */
  get progressToNext(): number {
    const next = this.nextLevel;
    if (!next) return 1;
    const start = this.level.minXp;
    return (this.xpTotal - start) / (next.minXp - start);
  }

  /**
   * Soma XP e devolve as promoções em ordem: o nível final é o do XP total, sem pular degraus no registro.
   * @throws Error se o XP não for um número positivo.
   */
  addExperience(amount: number): Promotion {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('O XP concedido deve ser maior que zero.');
    const before = this.xpTotal;
    const from = this.level;
    this.xpTotal += amount;
    const promotions = this.ladder.levelsCrossed(before, this.xpTotal);
    return { from, to: this.level, promotions, levelsGained: promotions.length };
  }

  /**
   * Conclui uma missão. Idempotente: concluir de novo não soma XP e devolve null.
   */
  completeQuest(questId: string, rewardXp: number): Promotion | null {
    if (this.quests.has(questId)) return null;
    const promotion = this.addExperience(rewardXp);
    this.quests.add(questId);
    return promotion;
  }

  toSnapshot(): ProgressSnapshot {
    return { learnerId: this.learnerId, trackId: this.ladder.trackId, xp: this.xpTotal, completedQuests: this.completedQuests };
  }
}
