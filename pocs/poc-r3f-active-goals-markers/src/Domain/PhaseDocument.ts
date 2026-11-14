// Domain: o documento da demo (src/Content/phases.json), no formato das fases do documento do curso do produto: a
// cidade (os prédios) e as fases, cada uma com as missões e, opcionalmente, as metas do autor. Conferido ao abrir a
// página: conteúdo inválido falha aqui, com o campo ou o código do problema, e não no meio da aula.
import { toCampus, type Campus } from './Campus';
import { goalProblems, type Goal, type Phase, type Quest } from './Goals';

export interface PhaseDocument {
  readonly city: Campus;
  readonly phases: readonly Phase[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';

function toQuest(raw: Record<string, unknown>, at: string): Quest {
  if (!isStr(raw.id) || !isStr(raw.buildingId) || !isStr(raw.titleKey)) throw new Error(`${at}: sem id, buildingId ou titleKey`);
  if (!isNum(raw.rewardXp) || raw.rewardXp < 0) throw new Error(`${at}: rewardXp precisa ser um número >= 0`);
  return { id: raw.id, buildingId: raw.buildingId, titleKey: raw.titleKey, rewardXp: raw.rewardXp };
}

function toGoal(raw: Record<string, unknown>, at: string): Goal {
  if (!isStr(raw.id) || !isStr(raw.titleKey)) throw new Error(`${at}: sem id ou titleKey`);
  if (!Array.isArray(raw.quests) || !raw.quests.every(isStr)) throw new Error(`${at}: quests precisa ser uma lista de ids`);
  return { id: raw.id, titleKey: raw.titleKey, quests: [...raw.quests] };
}

export function toPhaseDocument(raw: unknown): PhaseDocument {
  const d = raw as { city?: unknown; phases?: unknown };
  const city = toCampus(d.city);
  if (!Array.isArray(d.phases) || d.phases.length === 0) throw new Error('phases: precisa de ao menos uma fase');
  const buildingIds = new Set(city.buildings.map((b) => b.id));
  const questIds = new Set<string>();
  const phases = (d.phases as Record<string, unknown>[]).map((p, i): Phase => {
    const at = `phases[${i}]`;
    if (!isStr(p.id) || !isStr(p.titleKey) || !Array.isArray(p.quests)) throw new Error(`${at}: sem id, titleKey ou quests`);
    const quests = (p.quests as Record<string, unknown>[]).map((q, j) => toQuest(q, `${at}.quests[${j}]`));
    for (const q of quests) {
      // O id da missão é único no curso inteiro (o progresso guarda curso + missão).
      if (questIds.has(q.id)) throw new Error(`${at}: a missão ${q.id} se repete no curso`);
      if (!buildingIds.has(q.buildingId)) throw new Error(`${at}: a missão ${q.id} aponta o prédio ${q.buildingId}, que não existe`);
      questIds.add(q.id);
    }
    if (p.goals !== undefined && !Array.isArray(p.goals)) throw new Error(`${at}: goals precisa ser uma lista`);
    const goals = ((p.goals ?? []) as Record<string, unknown>[]).map((g, j) => toGoal(g, `${at}.goals[${j}]`));
    const phase: Phase = { id: p.id, titleKey: p.titleKey, quests, goals };
    const problems = goalProblems(phase);
    if (problems.length > 0) throw new Error(`${at}: ${problems.map((x) => `${x.code}@${x.goalId}${x.questId ? `/${x.questId}` : ''}`).join('; ')}`);
    return phase;
  });
  return { city, phases };
}
