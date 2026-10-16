/**
 * Um degrau da trilha: identificador estável e XP mínimo para alcançá-lo.
 *
 * @remarks
 * Value object imutável. A validação do conjunto de níveis (ordem, unicidade)
 * fica em {@link "Domain/ValueObjects/LevelLadder"!LevelLadder | LevelLadder}, que conhece todos os degraus.
 */
export interface Level {
  /** Identificador estável do nível (ex.: `"iniciante"`). Usado em snapshots e em chaves de tradução. */
  readonly id: string;
  /** XP mínimo, inclusivo, para estar neste nível. O primeiro nível da escada sempre tem `0`. */
  readonly minXp: number;
}
