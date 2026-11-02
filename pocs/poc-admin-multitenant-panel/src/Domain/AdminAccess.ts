// Quem pode o quê no admin (US36): a mesma tabela que o servidor confere em cada endpoint. A tela só usa esta regra
// para esconder o que não cabe ao papel; recusar de verdade é sempre papel do servidor.

/** Papéis do admin. `student` existe para provar que o aluno não entra. */
export type Role = 'platform_master' | 'tenant_admin' | 'course_author' | 'tutor' | 'student';

/** Quem está no admin: o papel, a instituição (fora do master da plataforma) e os cursos designados (autor). */
export interface Actor {
  readonly role: Role;
  /** Slug da instituição; o master da plataforma não tem (alcança todas). */
  readonly tenant?: string;
  /** Cursos em que o autor foi designado. */
  readonly courses?: readonly string[];
}

/** Ações do admin. */
export type Action =
  | 'institutions.manage'
  | 'members.view'
  | 'members.manage'
  | 'enrollments.decide'
  | 'courses.view'
  | 'courses.edit'
  | 'audit.view';

/** Onde a ação acontece: a instituição e, nas ações de curso, o curso. */
export interface Scope {
  readonly tenant: string;
  readonly course?: string;
}

const BY_ROLE: Readonly<Record<Role, readonly Action[]>> = {
  platform_master: ['institutions.manage', 'members.view', 'members.manage', 'enrollments.decide', 'courses.view', 'courses.edit', 'audit.view'],
  tenant_admin: ['members.view', 'members.manage', 'enrollments.decide', 'courses.view', 'courses.edit', 'audit.view'],
  course_author: ['courses.view', 'courses.edit'],
  tutor: ['members.view', 'courses.view'],
  student: [],
};

/**
 * O ator pode fazer a ação nesse lugar?
 *
 * @remarks
 * O master da plataforma alcança qualquer instituição. Os outros papéis só a própria, e o autor só os cursos em que
 * foi designado. Criar e desativar instituições é só do master da plataforma, que não tem `scope`.
 *
 * @param actor - Quem pede.
 * @param action - O que pede.
 * @param scope - Onde (a instituição e, se for o caso, o curso); omitido só em `institutions.manage`.
 * @returns `true` se for permitido.
 */
export function can(actor: Actor, action: Action, scope?: Scope): boolean {
  if (!BY_ROLE[actor.role].includes(action)) return false;
  if (actor.role === 'platform_master') return true;
  if (!scope || scope.tenant !== actor.tenant) return false;
  if (actor.role === 'course_author' && action === 'courses.edit') return scope.course !== undefined && (actor.courses ?? []).includes(scope.course);
  return true;
}

/** Seções da navegação lateral, na ordem. */
export const SECTIONS = ['institutions', 'members', 'enrollments', 'courses', 'audit'] as const;
export type Section = (typeof SECTIONS)[number];

const SECTION_ACTION: Readonly<Record<Section, Action>> = {
  institutions: 'institutions.manage',
  members: 'members.view',
  enrollments: 'enrollments.decide',
  courses: 'courses.view',
  audit: 'audit.view',
};

/**
 * As seções que o ator vê: as que ele pode usar em pelo menos uma instituição.
 *
 * @param actor - Quem está no admin.
 * @returns As seções, na ordem da navegação; vazia para o aluno.
 */
export function visibleSections(actor: Actor): Section[] {
  return SECTIONS.filter((s) => (s === 'institutions' ? can(actor, SECTION_ACTION[s]) : can(actor, SECTION_ACTION[s], { tenant: actor.tenant ?? '*' })));
}
