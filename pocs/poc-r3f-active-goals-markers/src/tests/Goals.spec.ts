// A regra das metas (US55) no domínio, com os cenários do Gherkin, os casos de conformidade comuns (que o validador PHP
// do produto vai rodar também) e o documento da demo.
import { describe, expect, it } from 'vitest';
import { goalHud, goalProblems, goalProgress, markedBuildings, MAX_GOALS, nextOpenQuest, questAt, sanitizePins, togglePin, type Phase } from '../Domain/Goals';
import { toPhaseDocument } from '../Domain/PhaseDocument';
import cases from '../Content/goal-cases.json';
import phasesData from '../Content/phases.json';
import { MESSAGES, translate } from '../Presentation/i18n/I18n';

const doc = toPhaseDocument(phasesData);
const fase1 = doc.phases[0];
const fase2 = doc.phases[1];
const done = (...ids: string[]) => new Set(ids);

describe('Gherkin da US55', () => {
  it('Fixar uma meta e ver os prédios: os dois prédios ganham o marcador e o HUD mostra 0 de 2', () => {
    const hud = goalHud(fase1, ['base-tecnica'], done());
    expect(hud.kind).toBe('goals');
    if (hud.kind !== 'goals') return;
    expect(hud.pinned[0]).toMatchObject({ done: 0, total: 2, status: 'open' });
    expect(markedBuildings(hud)).toEqual(['oficina', 'dados']);
  });

  it('Meta cumprida: concluir a segunda missão cumpre a meta e os marcadores somem', () => {
    const before = goalHud(fase1, ['base-tecnica'], done('testes'));
    expect(markedBuildings(before)).toEqual(['dados']);
    const after = goalHud(fase1, ['base-tecnica'], done('testes', 'consultas'));
    if (after.kind !== 'goals') throw new Error('esperava metas');
    expect(after.pinned[0].status).toBe('concluded');
    expect(markedBuildings(after)).toEqual([]);
  });

  it('Fase sem metas do autor: o HUD sugere a próxima missão aberta (e marca o prédio dela)', () => {
    const hud = goalHud(fase2, [], done());
    expect(hud).toEqual({ kind: 'suggestion', quest: fase2.quests[0] });
    expect(markedBuildings(hud)).toEqual(['produto']);
    const next = goalHud(fase2, [], done('refino'));
    expect(next.kind === 'suggestion' && next.quest?.id).toBe('revisao');
  });
});

describe('regra das metas', () => {
  it('o estado vem só das missões concluídas: aberta, em andamento, cumprida', () => {
    const g = fase1.goals![1];
    expect(goalProgress(g, fase1, done()).status).toBe('open');
    expect(goalProgress(g, fase1, done('entrevistas'))).toMatchObject({ status: 'in-progress', done: 1, total: 2 });
    expect(goalProgress(g, fase1, done('entrevistas', 'metricas')).status).toBe('concluded');
  });

  it('duas metas que dividem uma missão avançam juntas, e o prédio aparece uma vez só', () => {
    const hud = goalHud(fase1, ['visao-produto', 'plano'], done('metricas'));
    if (hud.kind !== 'goals') throw new Error('esperava metas');
    expect(hud.pinned.map((p) => p.done)).toEqual([1, 1]);
    expect(markedBuildings(hud)).toEqual(['produto']);
  });

  it('sem nenhuma meta fixada, nada é marcado', () => {
    expect(markedBuildings(goalHud(fase1, [], done()))).toEqual([]);
  });

  it('fixar e desafixar; as fixadas que o autor removeu (ou repetidas) são descartadas', () => {
    expect(togglePin([], 'plano')).toEqual(['plano']);
    expect(togglePin(['plano', 'base-tecnica'], 'plano')).toEqual(['base-tecnica']);
    expect(sanitizePins(['sumiu', 'plano', 'plano', 'base-tecnica'], fase1)).toEqual(['plano', 'base-tecnica']);
    expect(sanitizePins(['plano'], fase2)).toEqual([]);
  });

  it('a próxima missão aberta segue a ordem do autor; com a fase concluída, nenhuma', () => {
    expect(nextOpenQuest(fase1, done('testes'))?.id).toBe('entrevistas');
    expect(nextOpenQuest(fase1, new Set(fase1.quests.map((q) => q.id)))).toBeNull();
    const hud = goalHud(fase2, [], new Set(fase2.quests.map((q) => q.id)));
    expect(hud).toEqual({ kind: 'suggestion', quest: null });
    expect(markedBuildings(hud)).toEqual([]);
  });

  it('perto de um prédio, a missão feita ali é a primeira pendente dele', () => {
    expect(questAt(fase1, 'dados', done())?.id).toBe('consultas');
    expect(questAt(fase1, 'dados', done('consultas'))?.id).toBe('metricas');
    expect(questAt(fase1, 'dados', done('consultas', 'metricas'))).toBeNull();
  });
});

describe('validação das metas (casos de conformidade comuns ao TypeScript e ao PHP)', () => {
  for (const c of cases.cases) {
    it(c.name, () => {
      const phase: Phase = {
        id: 'f',
        titleKey: 'f',
        quests: cases.quests.map((id) => ({ id, buildingId: 'b', titleKey: id, rewardXp: 10 })),
        goals: c.goals.map((g) => ({ id: g.id, titleKey: g.id, quests: g.quests })),
      };
      expect(goalProblems(phase).map((p) => `${p.code}@${p.goalId}${p.questId ? `/${p.questId}` : ''}`)).toEqual(c.expect);
    });
  }

  it('o limite é uma página da lista pelo teclado', () => {
    expect(MAX_GOALS).toBe(10);
  });
});

describe('documento da demo', () => {
  it('meta com missão inexistente falha ao abrir a página, com o código', () => {
    const bad = structuredClone(phasesData) as { phases: { goals?: { quests: string[] }[] }[] };
    bad.phases[0].goals![0].quests.push('nao-existe');
    expect(() => toPhaseDocument(bad)).toThrow('GOAL_QUEST_UNKNOWN@base-tecnica/nao-existe');
  });

  it('missão num prédio que não existe e id de missão repetido no curso falham', () => {
    const noBuilding = structuredClone(phasesData) as { phases: { quests: { buildingId: string }[] }[] };
    noBuilding.phases[0].quests[0].buildingId = 'cantina';
    expect(() => toPhaseDocument(noBuilding)).toThrow('cantina');
    const dup = structuredClone(phasesData) as { phases: { quests: { id: string }[] }[] };
    dup.phases[1].quests[0].id = 'testes';
    expect(() => toPhaseDocument(dup)).toThrow('se repete');
  });

  it('todo texto do documento existe nos dois idiomas', () => {
    const keys = [
      ...doc.city.buildings.map((b) => b.labelKey),
      ...doc.phases.flatMap((p) => [p.titleKey, ...p.quests.map((q) => q.titleKey), ...(p.goals ?? []).map((g) => g.titleKey)]),
    ];
    for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      for (const k of keys) expect(translate(lang, k), `${lang}:${k}`).not.toBe(k);
    }
  });
});
