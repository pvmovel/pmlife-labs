// Validação do formulário "Nova instituição" (US36): o nome, o slug (endereço da instituição) e o e-mail do master dela.
// Os erros são códigos estáveis; a tela traduz. O servidor repete a mesma validação.

/** O que o master da plataforma preenche. */
export interface InstitutionDraft {
  readonly name: string;
  readonly slug: string;
  readonly masterEmail: string;
}

/** Código de erro por campo. */
export type InstitutionError = 'REQUIRED' | 'NAME_TOO_LONG' | 'SLUG_FORMAT' | 'SLUG_TAKEN' | 'EMAIL_FORMAT';

/** Mesmo formato do slug das instituições no produto (ADR-012). */
export const SLUG = /^[a-z][a-z0-9-]{1,19}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NAME = 80;

/**
 * Sugere o slug a partir do nome ("Colégio Horizonte" ➔ "colegio-horizonte"), cortado em 20 caracteres.
 *
 * @param name - Nome da instituição.
 * @returns O slug sugerido (pode não passar na validação, por exemplo se o nome começar por número).
 */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '');
}

/**
 * Confere o rascunho.
 *
 * @param d - O formulário (os espaços nas pontas não contam).
 * @param takenSlugs - Slugs já usados.
 * @returns Os erros por campo; vazio quando o rascunho é válido.
 */
export function validateInstitution(d: InstitutionDraft, takenSlugs: readonly string[]): Partial<Record<keyof InstitutionDraft, InstitutionError>> {
  const errors: Partial<Record<keyof InstitutionDraft, InstitutionError>> = {};
  const name = d.name.trim();
  const slug = d.slug.trim();
  const email = d.masterEmail.trim();
  if (!name) errors.name = 'REQUIRED';
  else if (name.length > MAX_NAME) errors.name = 'NAME_TOO_LONG';
  if (!slug) errors.slug = 'REQUIRED';
  else if (!SLUG.test(slug)) errors.slug = 'SLUG_FORMAT';
  else if (takenSlugs.includes(slug)) errors.slug = 'SLUG_TAKEN';
  if (!email) errors.masterEmail = 'REQUIRED';
  else if (!EMAIL.test(email)) errors.masterEmail = 'EMAIL_FORMAT';
  return errors;
}
