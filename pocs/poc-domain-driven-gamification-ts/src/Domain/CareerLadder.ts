// Domain (TypeScript puro): a escada de níveis de UMA trilha. O engine não conhece nenhuma trilha:
// níveis e limiares chegam de fora (Content), então uma trilha nova é só outro JSON.

/** Um degrau da escada: identificador, rótulo exibido e XP mínimo para alcançá-lo. */
export interface CareerLevel {
  readonly id: string;
  readonly label: string;
  readonly minXp: number;
}

export class InvalidLadderError extends Error {
  constructor(reason: string) {
    super(`Escada de níveis inválida: ${reason}`);
    this.name = 'InvalidLadderError';
  }
}

export class CareerLadder {
  private readonly levels: readonly CareerLevel[];

  /**
   * @throws InvalidLadderError se a escada estiver vazia, não começar em 0 XP,
   * tiver XP mínimo que não cresce de um nível para o outro ou ids repetidos.
   */
  constructor(
    readonly trackId: string,
    levels: readonly CareerLevel[],
  ) {
    if (levels.length === 0) throw new InvalidLadderError('precisa de pelo menos um nível');
    if (levels[0].minXp !== 0) throw new InvalidLadderError('o primeiro nível deve começar em 0 XP');
    for (let i = 1; i < levels.length; i++) {
      if (!(levels[i].minXp > levels[i - 1].minXp)) {
        throw new InvalidLadderError(`o XP mínimo de "${levels[i].id}" deve ser maior que o de "${levels[i - 1].id}"`);
      }
    }
    if (new Set(levels.map((l) => l.id)).size !== levels.length) throw new InvalidLadderError('ids de nível repetidos');
    this.levels = levels.map((l) => Object.freeze({ ...l }));
  }

  /** Todos os níveis, em ordem. */
  all(): readonly CareerLevel[] {
    return this.levels;
  }

  /** O nível correspondente a uma quantidade de XP: o maior degrau cujo mínimo foi alcançado. */
  levelFor(xp: number): CareerLevel {
    let current = this.levels[0];
    for (const level of this.levels) {
      if (xp >= level.minXp) current = level;
    }
    return current;
  }

  /** O próximo nível a alcançar, ou null no topo da escada. */
  nextLevelFor(xp: number): CareerLevel | null {
    return this.levels.find((l) => l.minXp > xp) ?? null;
  }

  /** Posição do nível na escada (0 = primeiro). */
  indexOf(level: CareerLevel): number {
    return this.levels.findIndex((l) => l.id === level.id);
  }
}
