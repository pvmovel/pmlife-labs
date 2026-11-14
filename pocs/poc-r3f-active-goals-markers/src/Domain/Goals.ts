// Domain: os objetivos ativos (US55), em TypeScript puro. O autor escreve as metas no documento da fase, cada uma ligada
// a missões; o aluno fixa uma ou mais no HUD. Nada é gravado em dobro: o estado da meta (cumprida, em andamento) é
// DERIVADO das missões concluídas, que já são o progresso do aluno. Só a escolha das metas fixadas fica no aparelho.

/** Uma missão da fase: o mesmo formato das missões do documento do curso (id único, prédio, título, XP). */
export interface Quest {
  readonly id: string;
  /** O prédio onde a missão é feita (o mesmo id da cidade da fase). */
  readonly buildingId: string;
  readonly titleKey: string;
  readonly rewardXp: number;
}

/** Uma meta escrita pelo autor: um título e as missões que a cumprem. */
export interface Goal {
  readonly id: string;
  readonly titleKey: string;
  /** Ids de missões da MESMA fase, na ordem sugerida. */
  readonly quests: readonly string[];
}

/** Uma fase: as missões e, opcionalmente, as metas do autor. */
export interface Phase {
  readonly id: string;
  readonly titleKey: string;
  readonly quests: readonly Quest[];
  /** Sem metas (ou lista vazia): o HUD sugere a próxima missão aberta. */
  readonly goals?: readonly Goal[];
}

/** No máximo 10 metas por fase: cabem numa página da lista pelo teclado (teclas 1 a 9 e 0, US52). */
export const MAX_GOALS = 10;

/** O motivo de uma meta ser recusada na publicação. O código é estável: a tela (e o validador PHP) o traduzem. */
export type GoalProblemCode = 'GOALS_TOO_MANY' | 'GOAL_ID_DUPLICATE' | 'GOAL_WITHOUT_QUESTS' | 'GOAL_QUEST_UNKNOWN' | 'GOAL_QUEST_REPEATED';

export interface GoalProblem {
  readonly code: GoalProblemCode;
  /** A meta apontada (vazio em GOALS_TOO_MANY). */
  readonly goalId: string;
  /** A missão apontada, quando o problema é dela. */
  readonly questId?: string;
}

/**
 * O que impede as metas de uma fase de serem publicadas: mais de {@link MAX_GOALS}, id repetido, meta sem missão,
 * missão que não existe na fase (Gherkin: "missão inexistente recusada") e missão repetida na mesma meta.
 * Duas metas podem dividir uma missão: concluí-la avança as duas.
 */
export function goalProblems(phase: Phase): GoalProblem[] {
  const goals = phase.goals ?? [];
  const out: GoalProblem[] = [];
  if (goals.length > MAX_GOALS) out.push({ code: 'GOALS_TOO_MANY', goalId: '' });
  const questIds = new Set(phase.quests.map((q) => q.id));
  const seen = new Set<string>();
  for (const g of goals) {
    if (seen.has(g.id)) out.push({ code: 'GOAL_ID_DUPLICATE', goalId: g.id });
    seen.add(g.id);
    if (g.quests.length === 0) out.push({ code: 'GOAL_WITHOUT_QUESTS', goalId: g.id });
    const inGoal = new Set<string>();
    for (const q of g.quests) {
      if (!questIds.has(q)) out.push({ code: 'GOAL_QUEST_UNKNOWN', goalId: g.id, questId: q });
      else if (inGoal.has(q)) out.push({ code: 'GOAL_QUEST_REPEATED', goalId: g.id, questId: q });
      inGoal.add(q);
    }
  }
  return out;
}

/** O estado de uma meta, no mesmo vocabulário da lista pelo teclado (US52): nunca "bloqueada". */
export type GoalStatus = 'open' | 'in-progress' | 'concluded';

export interface GoalProgress {
  readonly goal: Goal;
  /** Missões da meta já concluídas. */
  readonly done: number;
  readonly total: number;
  readonly status: GoalStatus;
  /** As missões que faltam, na ordem da meta. */
  readonly pending: readonly Quest[];
}

/** Quanto da meta já foi feito, derivado das missões concluídas (o progresso que já existe). */
export function goalProgress(goal: Goal, phase: Phase, completed: ReadonlySet<string>): GoalProgress {
  const byId = new Map(phase.quests.map((q) => [q.id, q]));
  const quests = goal.quests.map((id) => byId.get(id)).filter((q): q is Quest => q !== undefined);
  const pending = quests.filter((q) => !completed.has(q.id));
  const done = quests.length - pending.length;
  const status: GoalStatus = pending.length === 0 ? 'concluded' : done > 0 ? 'in-progress' : 'open';
  return { goal, done, total: quests.length, status, pending };
}

/** A próxima missão aberta da fase (a primeira não concluída, na ordem do autor), ou null com a fase concluída. */
export function nextOpenQuest(phase: Phase, completed: ReadonlySet<string>): Quest | null {
  return phase.quests.find((q) => !completed.has(q.id)) ?? null;
}

/** As metas fixadas que ainda valem nesta fase: tira as que o autor removeu e as repetidas, mantendo a ordem. */
export function sanitizePins(pinned: readonly string[], phase: Phase): string[] {
  const ids = new Set((phase.goals ?? []).map((g) => g.id));
  return pinned.filter((id, i) => ids.has(id) && pinned.indexOf(id) === i);
}

/** Fixa a meta, ou a desafixa se já estava fixada. */
export function togglePin(pinned: readonly string[], goalId: string): string[] {
  return pinned.includes(goalId) ? pinned.filter((id) => id !== goalId) : [...pinned, goalId];
}

/** O que o HUD mostra: as metas fixadas, ou, numa fase sem metas do autor, a sugestão da próxima missão. */
export type GoalHud =
  | { readonly kind: 'goals'; readonly pinned: readonly GoalProgress[] }
  | { readonly kind: 'suggestion'; readonly quest: Quest | null };

export function goalHud(phase: Phase, pinned: readonly string[], completed: ReadonlySet<string>): GoalHud {
  const goals = phase.goals ?? [];
  if (goals.length === 0) return { kind: 'suggestion', quest: nextOpenQuest(phase, completed) };
  const pins = sanitizePins(pinned, phase);
  return { kind: 'goals', pinned: pins.map((id) => goalProgress(goals.find((g) => g.id === id) as Goal, phase, completed)) };
}

/**
 * Os prédios que ganham o marcador 3D: os das missões que FALTAM nas metas fixadas (a meta cumprida não marca nada:
 * "os marcadores devem sumir"). Sem metas do autor, o prédio da missão sugerida. Sem repetição, na ordem de aparição.
 */
export function markedBuildings(hud: GoalHud): string[] {
  const ids = hud.kind === 'suggestion' ? (hud.quest ? [hud.quest.buildingId] : []) : hud.pinned.flatMap((p) => p.pending.map((q) => q.buildingId));
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

/**
 * Perto de um prédio, a missão que o aluno faz ali: a primeira não concluída daquele prédio. (Na demo, a tecla E
 * conclui a missão; no produto, a missão é feita na estação da sala do prédio.)
 */
export function questAt(phase: Phase, buildingId: string, completed: ReadonlySet<string>): Quest | null {
  return phase.quests.find((q) => q.buildingId === buildingId && !completed.has(q.id)) ?? null;
}
