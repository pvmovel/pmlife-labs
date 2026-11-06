// Domain: a validação do curso montado no admin, com os MESMOS códigos do validador do documento do produto
// (DocumentValidator, em TypeScript e em PHP). Cada problema aponta o item pelo caminho (o painel leva até ele). A
// publicação usa a mesma regra: nada inválido chega aos alunos. TypeScript puro.
import type { Course, Points } from './Course';

/** Um problema: o código estável e o caminho do item (`/phases/1/quests/0/buildingId`). */
export interface Problem {
  readonly code: string;
  readonly path: string;
}

const textEmpty = (t: { pt: string; en: string }) => !t.pt.trim() || !t.en.trim();

/**
 * Os problemas do curso, na ordem do documento (o curso, a escada, as fases e as missões).
 *
 * @param course - O curso.
 * @param catalog - O catálogo de atributos da instituição.
 * @returns A lista (vazia se pode publicar).
 */
export function validateCourse(course: Course, catalog: readonly string[]): Problem[] {
  const out: Problem[] = [];
  const add = (code: string, path: string) => out.push({ code, path });
  const phaseIds = course.phases.map((p) => p.id);
  const points = (p: Points, at: string) => {
    for (const [attr, n] of Object.entries(p)) {
      if (!course.attributes.includes(attr) || !catalog.includes(attr)) add('ATTRIBUTE_UNKNOWN', `${at}/${attr}`);
      else if (!Number.isInteger(n) || n < 0) add('ATTRIBUTE_POINTS_INVALID', `${at}/${attr}`);
    }
  };

  if (textEmpty(course.title)) add('TEXT_EMPTY', '/title');
  for (const a of course.attributes) if (!catalog.includes(a)) add('ATTRIBUTE_NOT_IN_CATALOG', `/attributes/${a}`);

  // A escada: começa em 0 XP e cresce; os requisitos são atributos do curso e fases que existem.
  if (course.levels.length === 0) add('LEVELS_EMPTY', '/levels');
  course.levels.forEach((l, i) => {
    const at = `/levels/${i}`;
    if (textEmpty(l.label)) add('TEXT_EMPTY', `${at}/label`);
    if (i === 0 && l.minXp !== 0) add('LEVEL_FIRST_NOT_ZERO', `${at}/minXp`);
    if (i > 0 && !(l.minXp > course.levels[i - 1].minXp)) add('LEVEL_XP_NOT_INCREASING', `${at}/minXp`);
    points(l.attributes, `${at}/attributes`);
    l.phases.forEach((p, k) => phaseIds.includes(p) || add('PHASE_UNKNOWN', `${at}/phases/${k}`));
  });

  // As fases: nome, pré-requisitos que existem (sem a própria fase e sem ciclo) e uma cidade com prédios.
  if (course.phases.length === 0) add('PHASES_EMPTY', '/phases');
  course.phases.forEach((p, i) => {
    const at = `/phases/${i}`;
    if (textEmpty(p.title)) add('TEXT_EMPTY', `${at}/title`);
    p.requires.forEach((r, k) => {
      if (r === p.id) add('PHASE_REQUIRES_SELF', `${at}/requires/${k}`);
      else if (!phaseIds.includes(r)) add('PHASE_UNKNOWN', `${at}/requires/${k}`);
    });
    if (p.buildings.length === 0) add('CITY_EMPTY', `${at}/buildings`);
    p.quests.forEach((q, j) => {
      const qp = `${at}/quests/${j}`;
      if (textEmpty(q.title)) add('TEXT_EMPTY', `${qp}/title`);
      if (!p.buildings.some((b) => b.id === q.buildingId)) add('QUEST_BUILDING_UNKNOWN', `${qp}/buildingId`);
      if (!Number.isInteger(q.xp) || q.xp <= 0) add('XP_NOT_POSITIVE', `${qp}/xp`);
      points(q.attributes, `${qp}/attributes`);
    });
  });
  const cycle = findCycle(course);
  if (cycle !== null) add('PHASE_CYCLE', `/phases/${cycle}/requires`);
  return out;
}

/** A primeira fase que está num ciclo de pré-requisitos (o índice), ou `null`. */
function findCycle(course: Course): number | null {
  const byId = new Map(course.phases.map((p) => [p.id, p]));
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    const found = (byId.get(id)?.requires ?? []).some((r) => r !== id && byId.has(r) && visit(r));
    state.set(id, 'done');
    return found;
  };
  for (const [i, p] of course.phases.entries()) {
    state.clear();
    if (visit(p.id)) return i;
  }
  return null;
}

/**
 * A ordem em que o aluno vê as fases: cada fase depois das que ela exige (com um ciclo, as que sobram ficam no fim).
 *
 * @param course - O curso.
 * @returns Os ids das fases, na ordem.
 */
export function phaseOrder(course: Course): string[] {
  const done: string[] = [];
  const pending = [...course.phases];
  while (pending.length > 0) {
    const i = pending.findIndex((p) => p.requires.every((r) => done.includes(r) || r === p.id || !course.phases.some((x) => x.id === r)));
    if (i < 0) {
      done.push(...pending.map((p) => p.id));
      break;
    }
    done.push(pending[i].id);
    pending.splice(i, 1);
  }
  return done;
}
