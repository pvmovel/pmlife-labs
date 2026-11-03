// O estado da PoC: os dados falsos em memória e as ações do admin. Cada ação confere a permissão (como o servidor
// faria), grava uma linha na auditoria e devolve o aviso para a tela. No produto, cada ação é um POST com CSRF.
import { useCallback, useState } from 'react';
import { can, type Actor } from '../Domain/AdminAccess';
import type { AuditEntry, Course, EnrollmentRequest, Institution, Member } from '../Domain/AdminRecords';
import type { InstitutionDraft } from '../Domain/InstitutionForm';
import { AUDIT, COURSES, ENROLLMENT_REQUESTS, INSTITUTIONS, MEMBERS } from '../Content/fakeData';

/** O que o relógio da PoC marca na auditoria (fixo, para a demo ser reproduzível). */
const NOW = '2026-11-02 10:00';
const TODAY = '2026-11-02';

export function useAdminStore(actor: Actor, actorName: string) {
  const [institutions, setInstitutions] = useState<Institution[]>(INSTITUTIONS);
  const [members, setMembers] = useState<Member[]>(MEMBERS);
  const [requests, setRequests] = useState<EnrollmentRequest[]>(ENROLLMENT_REQUESTS);
  const [courses, setCourses] = useState<Course[]>(COURSES);
  const [audit, setAudit] = useState<AuditEntry[]>(AUDIT);

  const log = useCallback((tenant: string, action: AuditEntry['action'], target: string) => setAudit((a) => [{ at: NOW, actor: actorName, tenant, action, target }, ...a]), [actorName]);

  const deny = () => {
    throw new Error('FORBIDDEN');
  };

  return {
    institutions,
    members,
    requests,
    courses,
    audit,
    createInstitution(d: InstitutionDraft) {
      if (!can(actor, 'institutions.manage')) deny();
      const inst: Institution = { slug: d.slug.trim(), name: d.name.trim(), active: true, members: 1, createdAt: TODAY };
      setInstitutions((l) => [inst, ...l]);
      log(inst.slug, 'institution.created', inst.name);
      return inst;
    },
    toggleInstitution(slug: string) {
      if (!can(actor, 'institutions.manage')) deny();
      const inst = institutions.find((i) => i.slug === slug);
      if (!inst) return;
      setInstitutions((l) => l.map((i) => (i.slug === slug ? { ...i, active: !i.active } : i)));
      if (inst.active) log(slug, 'institution.deactivated', inst.name);
      return !inst.active;
    },
    deactivateMember(id: string) {
      const m = members.find((x) => x.id === id);
      if (!m || !can(actor, 'members.manage', { tenant: m.tenant })) deny();
      setMembers((l) => l.map((x) => (x.id === id ? { ...x, active: false } : x)));
      log(m!.tenant, 'member.deactivated', m!.name);
    },
    decideEnrollment(id: string, approve: boolean) {
      const r = requests.find((x) => x.id === id);
      if (!r || !can(actor, 'enrollments.decide', { tenant: r.tenant })) deny();
      setRequests((l) => l.filter((x) => x.id !== id));
      log(r!.tenant, approve ? 'enrollment.approved' : 'enrollment.rejected', `${r!.student} · ${r!.course}`);
    },
    togglePublish(id: string) {
      const c = courses.find((x) => x.id === id);
      if (!c || !can(actor, 'courses.edit', { tenant: c.tenant, course: c.id })) deny();
      setCourses((l) => l.map((x) => (x.id === id ? { ...x, published: !x.published } : x)));
      if (!c!.published) log(c!.tenant, 'course.published', c!.title);
      return !c!.published;
    },
  };
}

export type AdminStore = ReturnType<typeof useAdminStore>;
