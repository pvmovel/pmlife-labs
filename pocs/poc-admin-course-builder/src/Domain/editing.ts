// Domain: as edições puras do curso no admin (US49), como as da cidade no editor do mundo (US37): cada uma devolve um
// curso novo, e a que não muda nada devolve o mesmo objeto (o editor não cria rascunho à toa). As regras de publicação
// são as do validateCourse; aqui ficam só as do editor (o id novo, a fase que sai leva os requisitos que apontavam
// para ela, a missão sempre num prédio da fase). TypeScript puro.
import type { Building, Course, Level, Phase, Points, Quest, Text2 } from './Course';

/** O próximo id livre com o prefixo (`fase-2`, `missao-3`). */
export function nextId(prefix: string, taken: readonly string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

const replaceAt = <T>(list: readonly T[], i: number, f: (x: T) => T): T[] => list.map((x, k) => (k === i ? f(x) : x));
const sameText = (a: Text2, b: Text2) => a.pt === b.pt && a.en === b.en;

export function setTitle(c: Course, title: Text2): Course {
  return sameText(c.title, title) ? c : { ...c, title };
}

/**
 * Liga ou desliga um atributo do catálogo no curso. Desligar tira os pontos dele dos níveis e das missões (senão o
 * validador apontaria ATTRIBUTE_UNKNOWN em cada um).
 */
export function toggleAttribute(c: Course, attribute: string): Course {
  if (c.attributes.includes(attribute)) {
    const drop = (p: Points): Points => Object.fromEntries(Object.entries(p).filter(([k]) => k !== attribute));
    return {
      ...c,
      attributes: c.attributes.filter((a) => a !== attribute),
      levels: c.levels.map((l) => ({ ...l, attributes: drop(l.attributes) })),
      phases: c.phases.map((p) => ({ ...p, quests: p.quests.map((q) => ({ ...q, attributes: drop(q.attributes) })) })),
    };
  }
  return { ...c, attributes: [...c.attributes, attribute] };
}

// ---- A escada de níveis

/** Acrescenta um nível no topo, com 1000 XP a mais que o último. */
export function addLevel(c: Course, label: Text2): Course {
  const last = c.levels[c.levels.length - 1];
  const level: Level = { id: nextId('nivel', c.levels.map((l) => l.id)), label, minXp: last ? last.minXp + 1000 : 0, attributes: {}, phases: [] };
  return { ...c, levels: [...c.levels, level] };
}

/** O que muda num nível. */
export interface LevelPatch {
  readonly label?: Text2;
  readonly minXp?: number;
  readonly attributes?: Points;
  readonly phases?: readonly string[];
}

export function updateLevel(c: Course, index: number, patch: LevelPatch): Course {
  if (!c.levels[index]) return c;
  return { ...c, levels: replaceAt(c.levels, index, (l) => ({ ...l, ...patch })) };
}

/** Tira um nível (o primeiro, de 0 XP, fica: sem ele a escada não começa). */
export function removeLevel(c: Course, index: number): Course {
  if (index <= 0 || !c.levels[index]) return c;
  return { ...c, levels: c.levels.filter((_, k) => k !== index) };
}

// ---- As fases

/** Acrescenta uma fase no fim, exigindo a última (a ordem natural), com um prédio para as missões. */
export function addPhase(c: Course, title: Text2, building: Text2): Course {
  const id = nextId('fase', c.phases.map((p) => p.id));
  const last = c.phases[c.phases.length - 1];
  const phase: Phase = { id, title, requires: last ? [last.id] : [], buildings: [{ id: 'predio-1', label: building }], quests: [] };
  return { ...c, phases: [...c.phases, phase] };
}

/** O que muda numa fase. */
export interface PhasePatch {
  readonly title?: Text2;
  readonly requires?: readonly string[];
}

export function updatePhase(c: Course, index: number, patch: PhasePatch): Course {
  if (!c.phases[index]) return c;
  return { ...c, phases: replaceAt(c.phases, index, (p) => ({ ...p, ...patch })) };
}

/** Liga ou desliga um pré-requisito da fase. */
export function toggleRequirement(c: Course, index: number, required: string): Course {
  const p = c.phases[index];
  if (!p || p.id === required) return c;
  const requires = p.requires.includes(required) ? p.requires.filter((r) => r !== required) : [...p.requires, required];
  return updatePhase(c, index, { requires });
}

/** Sobe (-1) ou desce (+1) a fase na lista. */
export function movePhase(c: Course, index: number, delta: -1 | 1): Course {
  const to = index + delta;
  if (!c.phases[index] || !c.phases[to]) return c;
  const phases = [...c.phases];
  [phases[index], phases[to]] = [phases[to], phases[index]];
  return { ...c, phases };
}

/** Tira uma fase e os pré-requisitos e as exigências de nível que apontavam para ela. A última fase fica. */
export function removePhase(c: Course, index: number): Course {
  const p = c.phases[index];
  if (!p || c.phases.length === 1) return c;
  return {
    ...c,
    phases: c.phases.filter((_, k) => k !== index).map((x) => (x.requires.includes(p.id) ? { ...x, requires: x.requires.filter((r) => r !== p.id) } : x)),
    levels: c.levels.map((l) => (l.phases.includes(p.id) ? { ...l, phases: l.phases.filter((r) => r !== p.id) } : l)),
  };
}

/** Acrescenta um prédio na fase (o editor do mundo posiciona depois). */
export function addBuilding(c: Course, phase: number, label: Text2): Course {
  const p = c.phases[phase];
  if (!p) return c;
  const b: Building = { id: nextId('predio', p.buildings.map((x) => x.id)), label };
  return { ...c, phases: replaceAt(c.phases, phase, (x) => ({ ...x, buildings: [...x.buildings, b] })) };
}

// ---- As missões

/** Acrescenta uma missão na fase, no primeiro prédio, com 100 XP. */
export function addQuest(c: Course, phase: number, title: Text2): { course: Course; index: number } {
  const p = c.phases[phase];
  if (!p) return { course: c, index: -1 };
  const taken = c.phases.flatMap((x) => x.quests.map((q) => q.id));
  const q: Quest = { id: nextId('missao', taken), title, buildingId: p.buildings[0]?.id ?? '', xp: 100, attributes: {} };
  return { course: { ...c, phases: replaceAt(c.phases, phase, (x) => ({ ...x, quests: [...x.quests, q] })) }, index: p.quests.length };
}

/** O que muda numa missão. */
export interface QuestPatch {
  readonly title?: Text2;
  readonly buildingId?: string;
  readonly xp?: number;
  readonly attributes?: Points;
}

export function updateQuest(c: Course, phase: number, index: number, patch: QuestPatch): Course {
  if (!c.phases[phase]?.quests[index]) return c;
  return { ...c, phases: replaceAt(c.phases, phase, (p) => ({ ...p, quests: replaceAt(p.quests, index, (q) => ({ ...q, ...patch })) })) };
}

export function removeQuest(c: Course, phase: number, index: number): Course {
  if (!c.phases[phase]?.quests[index]) return c;
  return { ...c, phases: replaceAt(c.phases, phase, (p) => ({ ...p, quests: p.quests.filter((_, k) => k !== index) })) };
}
