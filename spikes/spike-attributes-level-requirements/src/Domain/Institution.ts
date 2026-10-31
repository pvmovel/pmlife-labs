// Regras da instituição: o catálogo de atributos (de onde cada curso escolhe os seus), o total do aluno somando os
// cursos e o aviso ao admin antes de publicar uma escada mais dura (o nível é derivado, então pode cair).
import type { AttributePoints, CourseDoc, CourseHistory } from './CourseDocument';
import type { CourseProgress } from './CourseProgress';

/** Um problema no documento: código estável + caminho em JSON Pointer (o mesmo formato da US35). */
export interface Problem {
  readonly code: 'ATTRIBUTE_NOT_IN_CATALOG';
  readonly path: string;
}

/** O curso só usa atributos do catálogo da instituição. */
export function checkAttributes(doc: CourseDoc, catalog: readonly string[]): Problem[] {
  return doc.attributes.flatMap((a, i) => (catalog.includes(a) ? [] : [{ code: 'ATTRIBUTE_NOT_IN_CATALOG' as const, path: `/attributes/${i}` }]));
}

/** O total do aluno na instituição: XP e pontos de cada atributo, somando as matrículas (também derivado). */
export function institutionTotal(enrollments: readonly CourseProgress[]): { xp: number; attributes: AttributePoints } {
  const attributes: Record<string, number> = {};
  for (const e of enrollments) for (const [a, n] of Object.entries(e.attributes)) attributes[a] = (attributes[a] ?? 0) + n;
  return { xp: enrollments.reduce((sum, e) => sum + e.xp, 0), attributes };
}

/** Quem cairia de nível com a versão nova. */
export interface Demotion {
  readonly student: string;
  readonly from: string;
  readonly to: string;
}

/**
 * O efeito de publicar `next` como a versão nova: os alunos que desceriam de nível. Os pontos não mudam (cada missão
 * vale a versão em que foi feita); só a escada nova pode exigir mais.
 */
export function publishImpact(history: CourseHistory, next: CourseDoc, students: ReadonlyMap<string, CourseProgress>): Demotion[] {
  const version = Math.max(...history.keys()) + 1;
  const after = new Map(history).set(version, next);
  const out: Demotion[] = [];
  for (const [student, progress] of students) {
    const before = progress.level().current;
    const now = progress.withHistory(after).level().current;
    const rank = (id: string, doc: CourseDoc) => doc.levels.findIndex((l) => l.id === id);
    if (rank(now.id, next) < rank(before.id, next) || rank(before.id, next) === -1) out.push({ student, from: before.id, to: now.id });
  }
  return out;
}
