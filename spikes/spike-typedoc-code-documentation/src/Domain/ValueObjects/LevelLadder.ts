import type { Level } from './Level';

/**
 * Lançado quando a definição de uma escada de níveis é inválida.
 *
 * @see {@link LevelLadder.create} para as regras verificadas.
 */
export class InvalidLadderError extends Error {
  /**
   * Cria o erro com o motivo da rejeição.
   *
   * @param reason - Motivo legível da rejeição, usado só em logs e testes.
   */
  constructor(reason: string) {
    super(`Escada de níveis inválida: ${reason}`);
    this.name = 'InvalidLadderError';
  }
}

/**
 * Escada de níveis de uma trilha: a lista ordenada de {@link Level} pela qual o aluno sobe.
 *
 * @remarks
 * A escada é **dado**, não código: cada trilha traz a sua (JSON de conteúdo), e o domínio
 * só garante que ela é coerente. Assim o mesmo motor serve a qualquer trilha.
 *
 * @example
 * ```ts
 * const ladder = LevelLadder.create([
 *   { id: 'iniciante', minXp: 0 },
 *   { id: 'intermediario', minXp: 500 },
 *   { id: 'avancado', minXp: 1500 },
 * ]);
 * ladder.levelFor(700).id; // 'intermediario'
 * ```
 */
export class LevelLadder {
  private constructor(private readonly levels: readonly Level[]) {}

  /**
   * Valida e cria uma escada.
   *
   * @param levels - Níveis em ordem crescente de XP.
   * @returns A escada pronta para uso.
   * @throws {@link InvalidLadderError} se a lista estiver vazia, não começar em 0 XP,
   *   tiver XP fora de ordem crescente estrita ou ids repetidos.
   */
  static create(levels: readonly Level[]): LevelLadder {
    if (levels.length === 0) throw new InvalidLadderError('nenhum nível');
    if (levels[0].minXp !== 0) throw new InvalidLadderError('o primeiro nível precisa começar em 0 XP');
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].minXp <= levels[i - 1].minXp) {
        throw new InvalidLadderError(`XP fora de ordem em "${levels[i].id}"`);
      }
    }
    if (new Set(levels.map((l) => l.id)).size !== levels.length) {
      throw new InvalidLadderError('ids repetidos');
    }
    return new LevelLadder([...levels]);
  }

  /** O nível inicial (sempre o de 0 XP). */
  get first(): Level {
    return this.levels[0];
  }

  /**
   * Nível correspondente a uma quantidade de XP.
   *
   * @param xp - XP acumulado (valores negativos são tratados como 0).
   * @returns O nível mais alto cujo `minXp` é menor ou igual a `xp`.
   */
  levelFor(xp: number): Level {
    let current = this.levels[0];
    for (const level of this.levels) {
      if (xp >= level.minXp) current = level;
    }
    return current;
  }

  /**
   * Níveis atravessados ao ir de `fromXp` para `toXp`, na ordem em que foram alcançados.
   *
   * @param fromXp - XP antes do ganho.
   * @param toXp - XP depois do ganho.
   * @returns Lista vazia se nenhum degrau foi cruzado; um item por degrau caso contrário.
   */
  levelsCrossed(fromXp: number, toXp: number): Level[] {
    return this.levels.filter((l) => l.minXp > fromXp && l.minXp <= toXp);
  }
}
