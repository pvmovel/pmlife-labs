// Domain: a regra de merge do progresso. TypeScript puro.
//
// O progresso é MONOTÔNICO: uma missão concluída nunca "desconclui". Por isso o merge de dois aparelhos é só a união
// dos conjuntos de missões, e o XP nunca é somado nem guardado: é sempre DERIVADO do catálogo (soma das recompensas
// das missões concluídas). A união é comutativa, associativa e idempotente: em qualquer ordem, com qualquer repetição,
// todos os aparelhos chegam ao mesmo estado e o XP nunca conta em dobro.

/** Missão do catálogo da trilha (o que vale XP). */
export interface Quest {
  readonly id: string;
  readonly title: string;
  readonly rewardXp: number;
}

/** O catálogo da trilha: a única fonte do XP. */
export class QuestCatalog {
  private readonly byId: ReadonlyMap<string, Quest>;

  constructor(
    readonly trackId: string,
    readonly quests: readonly Quest[],
  ) {
    for (const q of quests) {
      if (!Number.isInteger(q.rewardXp) || q.rewardXp <= 0) throw new Error(`Recompensa inválida em ${q.id}`);
    }
    this.byId = new Map(quests.map((q) => [q.id, q]));
  }

  has(questId: string): boolean {
    return this.byId.has(questId);
  }

  reward(questId: string): number {
    return this.byId.get(questId)?.rewardXp ?? 0;
  }
}

/** União de missões concluídas, na ordem em que aparecem (primeiro as de `a`); repetidas contam uma vez. */
export function mergeCompletions(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Só as missões que existem no catálogo (um id inventado nunca vale XP). */
export function knownCompletions(quests: readonly string[], catalog: QuestCatalog): string[] {
  return mergeCompletions(quests, []).filter((id) => catalog.has(id));
}

/** XP derivado: a soma das recompensas das missões concluídas que existem no catálogo, cada uma uma vez. */
export function deriveXp(quests: readonly string[], catalog: QuestCatalog): number {
  return knownCompletions(quests, catalog).reduce((xp, id) => xp + catalog.reward(id), 0);
}

/** Chave de idempotência de uma conclusão: o mesmo aluno, na mesma trilha, conclui a mesma missão uma vez só. */
export function completionKey(userId: string, trackId: string, questId: string): string {
  return `${userId}:${trackId}:${questId}`;
}
