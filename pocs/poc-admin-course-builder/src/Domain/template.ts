// Domain: o curso novo nasce de um modelo mínimo válido (decisão do Pablo, 2026-11-06). O modelo é dado
// (src/Content/courseTemplate.json); aqui ele vira o curso da instituição, com o id e o título escolhidos. Nada é
// copiado de outro curso. TypeScript puro.
import { COURSE_SLUG, courseIdOf, type Course, type Text2 } from './Course';

/** O que o master informa no "Novo curso". */
export interface NewCourseInput {
  readonly slug: string;
  readonly title: Text2;
}

/** Por que o "Novo curso" não vale. */
export type NewCourseError = 'SLUG_FORMAT' | 'SLUG_TAKEN' | 'TITLE_REQUIRED';

/**
 * Confere o formulário do "Novo curso".
 *
 * @param input - O nome curto e o título.
 * @param taken - Os nomes curtos que a instituição já usa.
 * @returns Os erros por campo (vazio se vale).
 */
export function newCourseErrors(input: NewCourseInput, taken: readonly string[]): Partial<Record<'slug' | 'title', NewCourseError>> {
  const errors: { slug?: NewCourseError; title?: NewCourseError } = {};
  const slug = input.slug.trim();
  if (!COURSE_SLUG.test(slug)) errors.slug = 'SLUG_FORMAT';
  else if (taken.includes(slug)) errors.slug = 'SLUG_TAKEN';
  if (!input.title.pt.trim() || !input.title.en.trim()) errors.title = 'TITLE_REQUIRED';
  return errors;
}

/**
 * O curso novo a partir do modelo: o id da instituição, o nome curto e o título; o resto é o do modelo.
 *
 * @param template - O modelo mínimo (um curso válido).
 * @param tenant - A instituição.
 * @param input - O nome curto e o título.
 * @returns O curso, pronto para o rascunho.
 */
export function fromTemplate(template: Course, tenant: string, input: NewCourseInput): Course {
  return { ...template, courseId: courseIdOf(tenant, input.slug.trim()), title: { pt: input.title.pt.trim(), en: input.title.en.trim() } };
}
