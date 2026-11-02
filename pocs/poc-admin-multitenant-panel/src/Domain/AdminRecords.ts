// O que o admin lista (US36). No produto, cada lista vem de um endpoint que já filtra pela instituição da sessão.
import type { Role } from './AdminAccess';

export interface Institution {
  readonly slug: string;
  readonly name: string;
  readonly active: boolean;
  readonly members: number;
  /** Data de criação, `AAAA-MM-DD`. */
  readonly createdAt: string;
}

export interface Member {
  readonly id: string;
  readonly tenant: string;
  readonly name: string;
  readonly email: string;
  readonly role: Exclude<Role, 'platform_master'>;
  readonly active: boolean;
}

export interface EnrollmentRequest {
  readonly id: string;
  readonly tenant: string;
  readonly student: string;
  readonly course: string;
  /** Data do pedido, `AAAA-MM-DD`. */
  readonly requestedAt: string;
}

export interface Course {
  readonly id: string;
  readonly tenant: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly published: boolean;
}

export interface AuditEntry {
  /** Data e hora, `AAAA-MM-DD HH:MM`. */
  readonly at: string;
  readonly actor: string;
  readonly tenant: string;
  /** Código da ação (a tela traduz). */
  readonly action: 'institution.created' | 'institution.deactivated' | 'member.deactivated' | 'enrollment.approved' | 'enrollment.rejected' | 'course.published';
  readonly target: string;
}
