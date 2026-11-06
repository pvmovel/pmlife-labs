// O Domain da US49: o modelo mínimo é válido, o "Novo curso" confere o nome e o título, as edições puras (níveis,
// fases, pré-requisitos, missões e atributos), os códigos do validador (os mesmos do produto), a ordem das fases para o
// aluno, o rascunho e a publicação, e quem cria cursos.
import { describe, expect, it } from 'vitest';
import { COURSE_TEMPLATE, DEMO_INSTITUTION } from '../Content/institution';
import type { Course } from '../Domain/Course';
import { canCreateCourse, newDocument, publish, published, saveDraft, working } from '../Domain/Drafts';
import { addBuilding, addLevel, addPhase, addQuest, movePhase, nextId, removeLevel, removePhase, removeQuest, setTitle, toggleAttribute, toggleRequirement, updateLevel, updatePhase, updateQuest } from '../Domain/editing';
import { fromTemplate, newCourseErrors } from '../Domain/template';
import { phaseOrder, validateCourse } from '../Domain/validateCourse';

const CATALOG = DEMO_INSTITUTION.attributes.map((a) => a.id);
const keys = (c: Course) => validateCourse(c, CATALOG).map((p) => `${p.code}@${p.path}`);
const ingles = () => fromTemplate(COURSE_TEMPLATE, 'escola-idiomas', { slug: 'ingles-basico', title: { pt: 'Inglês Básico', en: 'Basic English' } });
const T = (pt: string) => ({ pt, en: pt });

describe('US49: o curso novo nasce do modelo mínimo', () => {
  it('o modelo é válido, e o curso novo leva o id da instituição e o título escolhidos (o resto é o do modelo)', () => {
    expect(keys(COURSE_TEMPLATE)).toEqual([]);
    const c = ingles();
    expect(c.courseId).toBe('escola-idiomas.ingles-basico');
    expect(c.title).toEqual({ pt: 'Inglês Básico', en: 'Basic English' });
    expect(c.phases).toBe(COURSE_TEMPLATE.phases);
    expect(keys(c)).toEqual([]);
  });

  it('o formulário: o nome curto no formato dos cursos, sem repetir, e o título nos dois idiomas', () => {
    expect(newCourseErrors({ slug: 'Ingles!', title: T('x') }, [])).toEqual({ slug: 'SLUG_FORMAT' });
    expect(newCourseErrors({ slug: 'a', title: T('x') }, [])).toEqual({ slug: 'SLUG_FORMAT' });
    expect(newCourseErrors({ slug: 'ingles', title: T('x') }, ['ingles'])).toEqual({ slug: 'SLUG_TAKEN' });
    expect(newCourseErrors({ slug: 'ingles', title: { pt: 'Inglês', en: ' ' } }, [])).toEqual({ title: 'TITLE_REQUIRED' });
    expect(newCourseErrors({ slug: ' ingles-2 ', title: T('x') }, [])).toEqual({});
  });

  it('Gherkin "Só os masters criam cursos": o master da instituição e o da plataforma criam; o autor não', () => {
    expect([canCreateCourse('tenant_admin'), canCreateCourse('platform_admin'), canCreateCourse('author')]).toEqual([true, true, false]);
  });
});

describe('US49: as edições puras', () => {
  it('a escada: o nível novo vem com mais XP; o primeiro (0 XP) não sai; o XP fora de ordem é apontado', () => {
    const c = addLevel(ingles(), T('Intermediário'));
    expect(c.levels.map((l) => [l.id, l.minXp])).toEqual([
      ['nivel-1', 0],
      ['nivel-2', 1000],
    ]);
    expect(removeLevel(c, 0)).toBe(c);
    expect(keys(updateLevel(c, 1, { minXp: 0 }))).toEqual(['LEVEL_XP_NOT_INCREASING@/levels/1/minXp']);
    expect(keys(updateLevel(c, 0, { minXp: 10 }))).toEqual(['LEVEL_FIRST_NOT_ZERO@/levels/0/minXp']);
    expect(removeLevel(c, 1).levels).toHaveLength(1);
  });

  it('Gherkin "Montar as fases e as missões": a fase 2 nasce depois da 1, com um prédio; a missão nova vai para ele', () => {
    const two = addPhase(ingles(), T('Fase 2'), T('Laboratório'));
    expect(two.phases[1]).toMatchObject({ id: 'fase-2', requires: ['fase-1'], buildings: [{ id: 'predio-1', label: T('Laboratório') }], quests: [] });
    const { course, index } = addQuest(two, 1, T('Diálogo no café'));
    expect(index).toBe(0);
    expect(course.phases[1].quests[0]).toMatchObject({ id: 'missao-2', buildingId: 'predio-1', xp: 100 });
    expect(keys(course)).toEqual([]);
    expect(phaseOrder(course)).toEqual(['fase-1', 'fase-2']);
  });

  it('a ordem do aluno segue os pré-requisitos, mesmo com a lista fora de ordem', () => {
    const c = movePhase(addPhase(ingles(), T('Fase 2'), T('Sala')), 1, -1);
    expect(c.phases.map((p) => p.id)).toEqual(['fase-2', 'fase-1']);
    expect(phaseOrder(c)).toEqual(['fase-1', 'fase-2']);
    expect(movePhase(c, 0, -1)).toBe(c);
  });

  it('os pré-requisitos: a própria fase não entra; um ciclo é apontado; a fase que sai leva os requisitos para ela', () => {
    const c = addPhase(addPhase(ingles(), T('Fase 2'), T('Sala')), T('Fase 3'), T('Sala'));
    expect(toggleRequirement(c, 0, 'fase-1')).toBe(c);
    expect(keys(toggleRequirement(c, 0, 'fase-3'))).toEqual(['PHASE_CYCLE@/phases/0/requires']);
    const withLevel = updateLevel(c, 0, { phases: ['fase-2'] });
    const removed = removePhase(withLevel, 1);
    expect(removed.phases.map((p) => [p.id, p.requires])).toEqual([
      ['fase-1', []],
      ['fase-3', []],
    ]);
    expect(removed.levels[0].phases).toEqual([]);
    expect(removePhase(ingles(), 0).phases).toHaveLength(1);
    expect(keys(updatePhase(c, 1, { requires: ['fase-9'] }))).toEqual(['PHASE_UNKNOWN@/phases/1/requires/0']);
  });

  it('Gherkin "Curso inválido não é publicado": a missão num prédio que não existe na fase é apontada', () => {
    const c = updateQuest(ingles(), 0, 0, { buildingId: 'predio-9' });
    expect(keys(c)).toEqual(['QUEST_BUILDING_UNKNOWN@/phases/0/quests/0/buildingId']);
    expect(keys(updateQuest(ingles(), 0, 0, { xp: 0 }))).toEqual(['XP_NOT_POSITIVE@/phases/0/quests/0/xp']);
    expect(keys(updateQuest(ingles(), 0, 0, { title: { pt: '', en: 'x' } }))).toEqual(['TEXT_EMPTY@/phases/0/quests/0/title']);
    expect(addBuilding(ingles(), 0, T('Biblioteca')).phases[0].buildings.map((b) => b.id)).toEqual(['predio-1', 'predio-2']);
    expect(removeQuest(ingles(), 0, 0).phases[0].quests).toEqual([]);
  });

  it('os atributos: só os do catálogo; desligar um tira os pontos dele dos níveis e das missões', () => {
    let c = toggleAttribute(ingles(), 'fala');
    c = updateQuest(c, 0, 0, { attributes: { fala: 10 } });
    c = updateLevel(c, 0, { attributes: { fala: 0 } });
    expect(keys(c)).toEqual([]);
    expect(keys(updateQuest(c, 0, 0, { attributes: { fala: -1 } }))).toEqual(['ATTRIBUTE_POINTS_INVALID@/phases/0/quests/0/attributes/fala']);
    expect(keys(updateQuest(c, 0, 0, { attributes: { escuta: 5 } }))).toEqual(['ATTRIBUTE_UNKNOWN@/phases/0/quests/0/attributes/escuta']);
    const off = toggleAttribute(c, 'fala');
    expect(off.attributes).toEqual([]);
    expect(off.phases[0].quests[0].attributes).toEqual({});
    expect(keys({ ...c, attributes: ['danca'] })).toContain('ATTRIBUTE_NOT_IN_CATALOG@/attributes/danca');
  });

  it('a edição que não muda nada devolve o mesmo curso; o id novo pula os que existem', () => {
    const c = ingles();
    expect(setTitle(c, { ...c.title })).toBe(c);
    expect(updateQuest(c, 5, 0, { xp: 1 })).toBe(c);
    expect(nextId('fase', ['fase-1', 'fase-3'])).toBe('fase-2');
  });
});

describe('US49: o rascunho e a publicação', () => {
  it('o curso novo é só rascunho (os alunos não o veem); publicar valida, cria a versão 1 e apaga o rascunho', () => {
    const doc = newDocument('ingles-basico', ingles());
    expect(published(doc)).toBeNull();
    const bad = saveDraft(doc, updateQuest(working(doc), 0, 0, { buildingId: 'x' }));
    const refused = publish(bad, CATALOG);
    expect(refused.ok).toBe(false);
    expect(published(bad)).toBeNull();
    const ok = publish(doc, CATALOG);
    if (!ok.ok) throw new Error('devia publicar');
    expect(ok.version).toBe(1);
    expect(ok.doc.draft).toBeNull();
    expect(published(ok.doc)?.courseId).toBe('escola-idiomas.ingles-basico');
  });
});
