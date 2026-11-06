// A instituição da demonstração (fictícia): uma escola de idiomas recém-criada, ainda sem nenhum curso, com o catálogo
// de atributos dela. O modelo mínimo do curso novo vem de courseTemplate.json (dado, conferido pelo validador).
import type { Course } from '../Domain/Course';
import template from './courseTemplate.json';

/** A instituição em foco. */
export interface DemoInstitution {
  readonly slug: string;
  readonly name: string;
  /** O catálogo de atributos da sede da instituição (ADR-012). */
  readonly attributes: readonly { readonly id: string; readonly label: { readonly pt: string; readonly en: string } }[];
}

export const DEMO_INSTITUTION: DemoInstitution = {
  slug: 'escola-idiomas',
  name: 'Escola de Idiomas Aurora (fictícia)',
  attributes: [
    { id: 'fala', label: { pt: 'Fala', en: 'Speaking' } },
    { id: 'escuta', label: { pt: 'Escuta', en: 'Listening' } },
    { id: 'escrita', label: { pt: 'Escrita', en: 'Writing' } },
  ],
};

/** O modelo mínimo válido do curso novo. */
export const COURSE_TEMPLATE = template as Course;
