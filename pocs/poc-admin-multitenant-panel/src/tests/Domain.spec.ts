// O Domain do admin: quem pode o quê (papel × instituição × curso), a listagem das tabelas e a validação do formulário.
import { describe, expect, it } from 'vitest';
import { can, visibleSections, type Actor } from '../Domain/AdminAccess';
import { listRows, normalize } from '../Domain/Listing';
import { slugFromName, validateInstitution } from '../Domain/InstitutionForm';

const master: Actor = { role: 'platform_master' };
const auroraAdmin: Actor = { role: 'tenant_admin', tenant: 'aurora' };
const author: Actor = { role: 'course_author', tenant: 'aurora', courses: ['concursos'] };
const tutor: Actor = { role: 'tutor', tenant: 'aurora' };
const student: Actor = { role: 'student', tenant: 'aurora' };

describe('can: papel × instituição', () => {
  it('o master da plataforma alcança qualquer instituição e é o único que cria instituições', () => {
    expect(can(master, 'institutions.manage')).toBe(true);
    expect(can(master, 'members.manage', { tenant: 'horizonte' })).toBe(true);
    expect(can(auroraAdmin, 'institutions.manage')).toBe(false);
  });

  it('o master da instituição só alcança a própria; outra instituição é recusada', () => {
    expect(can(auroraAdmin, 'members.manage', { tenant: 'aurora' })).toBe(true);
    expect(can(auroraAdmin, 'members.view', { tenant: 'horizonte' })).toBe(false);
    expect(can(auroraAdmin, 'members.view')).toBe(false);
  });

  it('o autor só edita os cursos em que foi designado; o tutor só acompanha; o aluno não pode nada', () => {
    expect(can(author, 'courses.edit', { tenant: 'aurora', course: 'concursos' })).toBe(true);
    expect(can(author, 'courses.edit', { tenant: 'aurora', course: 'enem' })).toBe(false);
    expect(can(author, 'courses.edit', { tenant: 'aurora' })).toBe(false);
    expect(can(author, 'members.view', { tenant: 'aurora' })).toBe(false);
    expect(can(tutor, 'members.view', { tenant: 'aurora' })).toBe(true);
    expect(can(tutor, 'members.manage', { tenant: 'aurora' })).toBe(false);
    for (const a of ['members.view', 'courses.view', 'audit.view'] as const) expect(can(student, a, { tenant: 'aurora' })).toBe(false);
  });

  it('a navegação mostra só as seções do papel; o aluno não tem nenhuma', () => {
    expect(visibleSections(master)).toEqual(['institutions', 'members', 'enrollments', 'courses', 'audit']);
    expect(visibleSections(auroraAdmin)).toEqual(['members', 'enrollments', 'courses', 'audit']);
    expect(visibleSections(author)).toEqual(['courses']);
    expect(visibleSections(tutor)).toEqual(['members', 'courses']);
    expect(visibleSections(student)).toEqual([]);
  });
});

describe('listRows: busca, ordenação e paginação', () => {
  const rows = ['João', 'Ana', 'Íris', 'Bruno', 'item 10', 'item 9'].map((name, i) => ({ name, n: i }));

  it('a busca ignora acento e maiúsculas', () => {
    expect(normalize('  AÇÃO ')).toBe('acao');
    expect(listRows(rows, { search: 'joao', fields: ['name'], page: 1, pageSize: 10 }).items.map((r) => r.name)).toEqual(['João']);
    expect(listRows(rows, { search: 'IRIS', fields: ['name'], page: 1, pageSize: 10 }).total).toBe(1);
  });

  it('ordena com números na ordem natural e nos dois sentidos', () => {
    const asc = listRows(rows, { search: 'item', fields: ['name'], sort: { field: 'name', dir: 'asc' }, page: 1, pageSize: 10 });
    expect(asc.items.map((r) => r.name)).toEqual(['item 9', 'item 10']);
    const desc = listRows(rows, { search: '', fields: ['name'], sort: { field: 'name', dir: 'desc' }, page: 1, pageSize: 2 });
    expect(desc.items.map((r) => r.name)).toEqual(['João', 'item 10']);
  });

  it('pagina, traz a página pedida para dentro do intervalo e tem pelo menos 1 página', () => {
    expect(listRows(rows, { search: '', fields: ['name'], page: 2, pageSize: 4 })).toMatchObject({ total: 6, pages: 2, page: 2 });
    expect(listRows(rows, { search: '', fields: ['name'], page: 9, pageSize: 4 }).page).toBe(2);
    expect(listRows(rows, { search: 'zzz', fields: ['name'], page: 3, pageSize: 4 })).toMatchObject({ items: [], total: 0, pages: 1, page: 1 });
  });
});

describe('validateInstitution', () => {
  it('sugere o slug pelo nome, sem acento e com no máximo 20 caracteres', () => {
    expect(slugFromName('Colégio Horizonte')).toBe('colegio-horizonte');
    expect(slugFromName('Instituto de Ciências Aplicadas do Sul')).toBe('instituto-de-ciencia');
  });

  it('aceita um rascunho válido (espaços nas pontas não contam)', () => {
    expect(validateInstitution({ name: ' Escola Litoral ', slug: 'litoral', masterEmail: ' ana@litoral.test ' }, ['aurora'])).toEqual({});
  });

  it('recusa campos vazios, slug fora do formato ou já usado e e-mail inválido', () => {
    expect(validateInstitution({ name: '', slug: '', masterEmail: '' }, [])).toEqual({ name: 'REQUIRED', slug: 'REQUIRED', masterEmail: 'REQUIRED' });
    expect(validateInstitution({ name: 'x'.repeat(81), slug: '1escola', masterEmail: 'ana@' }, [])).toEqual({ name: 'NAME_TOO_LONG', slug: 'SLUG_FORMAT', masterEmail: 'EMAIL_FORMAT' });
    expect(validateInstitution({ name: 'Aurora', slug: 'aurora', masterEmail: 'a@b.test' }, ['aurora']).slug).toBe('SLUG_TAKEN');
  });
});
