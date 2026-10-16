import type { Level } from '../ValueObjects/Level';
import type { LevelLadder } from '../ValueObjects/LevelLadder';

/**
 * Resultado de concluir uma missão.
 *
 * @see {@link LearnerProgress.completeMission}
 */
export interface MissionResult {
  /** `false` quando a missão já tinha sido concluída antes (nada mudou). */
  readonly applied: boolean;
  /** Níveis alcançados com esta missão, em ordem. Vazio se o aluno não subiu de nível. */
  readonly promotions: readonly Level[];
}

/**
 * Forma serializável do progresso, gravada e lida pela porta de persistência da camada de aplicação.
 *
 * @remarks
 * O domínio não referencia a aplicação (nem na documentação): quem aponta para cá é a porta.
 */
export interface ProgressSnapshot {
  /** Trilha a que o progresso pertence. */
  readonly trackId: string;
  /** XP acumulado. */
  readonly xp: number;
  /** Ids das missões já concluídas. */
  readonly completedMissions: readonly string[];
}

/**
 * Progresso de um aluno em uma trilha.
 *
 * @remarks
 * O nível nunca é gravado: ele é **derivado** do XP pela {@link LevelLadder} da trilha.
 * Assim, mudar a escada não deixa progresso antigo inconsistente.
 */
export class LearnerProgress {
  private constructor(
    /** Trilha do progresso. */
    readonly trackId: string,
    private readonly ladder: LevelLadder,
    private xpTotal: number,
    private readonly done: Set<string>,
  ) {}

  /**
   * Progresso zerado em uma trilha.
   *
   * @param trackId - Id da trilha.
   * @param ladder - Escada de níveis da trilha.
   */
  static start(trackId: string, ladder: LevelLadder): LearnerProgress {
    return new LearnerProgress(trackId, ladder, 0, new Set());
  }

  /**
   * Reconstrói o progresso a partir de um snapshot gravado.
   *
   * @param snapshot - Dados lidos do repositório.
   * @param trackId - Trilha esperada.
   * @param ladder - Escada atual da trilha.
   * @throws Error se o snapshot for de outra trilha.
   */
  static restore(snapshot: ProgressSnapshot, trackId: string, ladder: LevelLadder): LearnerProgress {
    if (snapshot.trackId !== trackId) {
      throw new Error(`Snapshot da trilha "${snapshot.trackId}" não pode ser usado em "${trackId}"`);
    }
    return new LearnerProgress(trackId, ladder, snapshot.xp, new Set(snapshot.completedMissions));
  }

  /** XP acumulado. */
  get xp(): number {
    return this.xpTotal;
  }

  /** Nível atual, derivado do XP. */
  get level(): Level {
    return this.ladder.levelFor(this.xpTotal);
  }

  /**
   * Conclui uma missão e soma o XP dela.
   *
   * @param missionId - Id da missão.
   * @param xp - XP concedido (deve ser positivo).
   * @returns O que mudou. Concluir de novo a mesma missão não soma XP (idempotente).
   *
   * @example
   * ```ts
   * const r = progress.completeMission('m1', 1600);
   * r.promotions.map((l) => l.id); // ['intermediario', 'avancado']
   * ```
   */
  completeMission(missionId: string, xp: number): MissionResult {
    if (this.done.has(missionId)) return { applied: false, promotions: [] };
    const before = this.xpTotal;
    this.xpTotal += Math.max(0, xp);
    this.done.add(missionId);
    return { applied: true, promotions: this.ladder.levelsCrossed(before, this.xpTotal) };
  }

  /** Converte para a forma gravável. */
  toSnapshot(): ProgressSnapshot {
    return { trackId: this.trackId, xp: this.xpTotal, completedMissions: [...this.done] };
  }
}
