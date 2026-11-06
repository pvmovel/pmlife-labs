// Domain: o ciclo do curso no servidor (o mesmo do editor do mundo, US37): editar mexe só no rascunho; publicar valida,
// cria a versão nova e apaga o rascunho; o aluno vê sempre a última versão publicada. O curso novo nasce como rascunho,
// sem versão publicada (os alunos ainda não o veem). Só os masters criam cursos (decisão do Pablo); o autor do curso,
// designado depois, edita e publica só o dele. TypeScript puro.
import type { Course } from './Course';
import { validateCourse, type Problem } from './validateCourse';

/** Os papéis da demonstração. */
export type Role = 'tenant_admin' | 'platform_admin' | 'author';

/** Um curso da instituição: as versões publicadas e, se houver, o rascunho. */
export interface CourseDocument {
  readonly slug: string;
  /** Da primeira para a última. */
  readonly versions: readonly Course[];
  readonly draft: Course | null;
}

/** Quem pode criar um curso: o master da instituição e o da plataforma (com a instituição em foco). */
export const canCreateCourse = (role: Role): boolean => role === 'tenant_admin' || role === 'platform_admin';

/** O que o editor mostra: o rascunho, ou a última versão publicada. */
export const working = (doc: CourseDocument): Course => doc.draft ?? doc.versions[doc.versions.length - 1];

/** A última versão publicada (o que o aluno vê), ou `null` se o curso ainda não foi publicado. */
export const published = (doc: CourseDocument): Course | null => doc.versions[doc.versions.length - 1] ?? null;

/** O curso novo: só o rascunho, sem versão publicada. */
export const newDocument = (slug: string, course: Course): CourseDocument => ({ slug, versions: [], draft: course });

/** Grava uma edição no rascunho. */
export const saveDraft = (doc: CourseDocument, course: Course): CourseDocument => ({ ...doc, draft: course });

/** O resultado de publicar: a versão nova, ou os problemas que impedem. */
export type PublishResult = { readonly ok: true; readonly doc: CourseDocument; readonly version: number } | { readonly ok: false; readonly problems: readonly Problem[] };

/**
 * Publica o rascunho, se ele passa na validação (a mesma da tela).
 *
 * @param doc - O curso.
 * @param catalog - O catálogo de atributos da instituição.
 * @returns A versão nova (e o rascunho apagado), ou os problemas.
 */
export function publish(doc: CourseDocument, catalog: readonly string[]): PublishResult {
  if (!doc.draft) return { ok: true, doc, version: doc.versions.length };
  const problems = validateCourse(doc.draft, catalog);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, doc: { ...doc, versions: [...doc.versions, doc.draft], draft: null }, version: doc.versions.length + 1 };
}
