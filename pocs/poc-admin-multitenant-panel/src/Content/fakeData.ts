// Dados falsos da PoC: instituições, pessoas, pedidos de matrícula, cursos e auditoria. Nomes inventados, e-mails no
// domínio reservado .test, nada do produto.
import type { Actor } from '../Domain/AdminAccess';
import type { AuditEntry, Course, EnrollmentRequest, Institution, Member } from '../Domain/AdminRecords';

const CITIES = ['Aurora', 'Horizonte', 'Alvorada', 'Bússola', 'Cais', 'Delta', 'Estrela', 'Farol', 'Girassol', 'Ipê', 'Jacarandá', 'Lumiar', 'Maré', 'Nascente', 'Oásis', 'Pomar', 'Quaresma', 'Rio Claro', 'Serra', 'Trilha', 'Urca', 'Vale'];
const KINDS = ['Escola', 'Colégio', 'Instituto', 'Curso'];
const slug = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const INSTITUTIONS: Institution[] = CITIES.map((city, i) => ({
  slug: slug(city),
  name: `${KINDS[i % KINDS.length]} ${city}`,
  active: i % 7 !== 6,
  members: 12 + ((i * 37) % 180),
  createdAt: `2026-${String(1 + (i % 10)).padStart(2, '0')}-${String(3 + ((i * 5) % 25)).padStart(2, '0')}`,
}));

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Íris', 'João', 'Kátia', 'Lucas', 'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Raquel', 'Sérgio', 'Tânia', 'Úrsula', 'Vítor', 'Wesley', 'Yara', 'Zeca'];
const LAST = ['Souza', 'Lima', 'Prado', 'Rocha', 'Teixeira', 'Moura', 'Campos'];

const people = (tenant: string, count: number, offset: number): Member[] =>
  Array.from({ length: count }, (_, i) => {
    const first = FIRST[(i + offset) % FIRST.length];
    const last = LAST[(i * 3 + offset) % LAST.length];
    const role: Member['role'] = i === 0 ? 'tenant_admin' : i === 1 ? 'course_author' : i === 2 ? 'tutor' : 'student';
    return { id: `${tenant}-${i + 1}`, tenant, name: `${first} ${last}`, email: `${slug(first)}.${slug(last)}${i}@${tenant}.test`, role, active: i % 9 !== 8 };
  });

export const MEMBERS: Member[] = [...people('aurora', 31, 0), ...people('horizonte', 14, 5)];

export const COURSES: Course[] = [
  { id: 'dev-to-pm', tenant: 'aurora', title: 'Dev a PM', authors: ['aurora-2'], published: true },
  { id: 'aurora.concursos', tenant: 'aurora', title: 'Concursos', authors: ['aurora-2'], published: false },
  { id: 'aurora.enem', tenant: 'aurora', title: 'ENEM', authors: [], published: true },
  { id: 'horizonte.robotica', tenant: 'horizonte', title: 'Robótica', authors: ['horizonte-2'], published: true },
];

export const ENROLLMENT_REQUESTS: EnrollmentRequest[] = [
  { id: 'r1', tenant: 'aurora', student: 'Lucas Teixeira', course: 'Concursos', requestedAt: '2026-10-30' },
  { id: 'r2', tenant: 'aurora', student: 'Marina Moura', course: 'Concursos', requestedAt: '2026-10-31' },
  { id: 'r3', tenant: 'aurora', student: 'Paulo Campos', course: 'ENEM', requestedAt: '2026-11-01' },
  { id: 'r4', tenant: 'horizonte', student: 'Íris Prado', course: 'Robótica', requestedAt: '2026-11-01' },
];

export const AUDIT: AuditEntry[] = [
  { at: '2026-11-01 09:12', actor: 'master@pmlife.test', tenant: 'horizonte', action: 'institution.created', target: 'Colégio Horizonte' },
  { at: '2026-11-01 10:40', actor: 'ana.souza0@aurora.test', tenant: 'aurora', action: 'enrollment.approved', target: 'Kátia Prado · Concursos' },
  { at: '2026-11-01 11:03', actor: 'ana.souza0@aurora.test', tenant: 'aurora', action: 'member.deactivated', target: 'Íris Campos' },
  { at: '2026-11-01 14:55', actor: 'bruno.rocha1@aurora.test', tenant: 'aurora', action: 'course.published', target: 'Dev a PM' },
  { at: '2026-11-02 08:20', actor: 'master@pmlife.test', tenant: 'farol', action: 'institution.deactivated', target: 'Instituto Farol' },
  { at: '2026-11-02 09:05', actor: 'gabriela.lima0@horizonte.test', tenant: 'horizonte', action: 'enrollment.rejected', target: 'Heitor Souza · Robótica' },
];

/** As identidades que a PoC deixa escolher ("Ver como"), para mostrar o mesmo admin por papel. */
export const DEMO_ACTORS: readonly { readonly id: string; readonly actor: Actor; readonly name: string }[] = [
  { id: 'platform', actor: { role: 'platform_master' }, name: 'master@pmlife.test' },
  { id: 'aurora-admin', actor: { role: 'tenant_admin', tenant: 'aurora' }, name: 'Ana Souza' },
  { id: 'aurora-author', actor: { role: 'course_author', tenant: 'aurora', courses: ['dev-to-pm', 'aurora.concursos'] }, name: 'Bruno Rocha' },
  { id: 'aurora-tutor', actor: { role: 'tutor', tenant: 'aurora' }, name: 'Carla Campos' },
  { id: 'aurora-student', actor: { role: 'student', tenant: 'aurora' }, name: 'Lucas Moura' },
];
