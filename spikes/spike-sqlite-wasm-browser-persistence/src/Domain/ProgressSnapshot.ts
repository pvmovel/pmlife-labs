// Domain: o progresso gravável de um aluno numa trilha (dados fictícios; a regra de níveis fica na PoC de gamificação).
export interface ProgressSnapshot {
  readonly trackId: string;
  readonly xp: number;
  readonly completedMissions: readonly string[];
}
