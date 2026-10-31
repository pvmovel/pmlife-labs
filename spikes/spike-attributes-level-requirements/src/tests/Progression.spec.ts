// As regras que não cabem num caso de conformidade: a nota proporcional (OCP), o catálogo de atributos, o total na
// instituição, o aviso antes de publicar uma escada mais dura e a fila offline com versões.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Completion } from '@domain/CourseDocument';
import { CourseProgress } from '@domain/CourseProgress';
import { checkAttributes, institutionTotal, publishImpact } from '@domain/Institution';
import { applyQueue } from '@domain/OfflineSync';
import type { QuestScoring } from '@domain/QuestScoring';
import { history, readDoc, ROOT } from './conformance';

const done = (...ids: string[]): Completion[] => ids.map((questId) => ({ questId, version: 1 }));
const institution = JSON.parse(readFileSync(path.join(ROOT, 'src', 'Content', 'institution.json'), 'utf8')) as { attributes: string[] };

describe('pontos da missão (Open/Closed)', () => {
  it('a nota proporcional é outra QuestScoring: a progressão não muda', () => {
    const half: QuestScoring = { score: (q) => ({ xp: q.rewardXp / 2, attributes: Object.fromEntries(Object.entries(q.attributes ?? {}).map(([a, n]) => [a, n / 2])) }) };
    const p = new CourseProgress(history('astro-demo', [1]), done('q-telescopio', 'q-orbitas'), half);
    expect(p.xp).toBe(2500);
    expect(p.attributes).toEqual({ calculo: 10, observacao: 10 });
  });
});

describe('catálogo de atributos da instituição', () => {
  it('os dois cursos usam só atributos do catálogo', () => {
    expect(checkAttributes(readDoc('astro-demo', 2), institution.attributes)).toEqual([]);
    expect(checkAttributes(readDoc('clima-demo', 1), institution.attributes)).toEqual([]);
  });

  it('um atributo fora do catálogo é recusado com código e caminho', () => {
    const doc = { ...readDoc('astro-demo', 2), attributes: ['calculo', 'astrologia'] };
    expect(checkAttributes(doc, institution.attributes)).toEqual([{ code: 'ATTRIBUTE_NOT_IN_CATALOG', path: '/attributes/1' }]);
  });
});

describe('total na instituição', () => {
  it('soma XP e atributos das matrículas pelo id do atributo do catálogo', () => {
    const astro = new CourseProgress(history('astro-demo', [1]), done('q-telescopio', 'q-orbitas'));
    const clima = new CourseProgress(history('clima-demo', [1]), done('q-previsao'));
    expect(institutionTotal([astro, clima])).toEqual({ xp: 7000, attributes: { calculo: 35, observacao: 20, comunicacao: 10 } });
  });
});

describe('publicar uma escada mais dura (o nível é derivado e pode cair)', () => {
  const v12 = history('astro-demo', [1, 2]);
  const students = new Map([
    // Observador com cálculo 30 na v2 (que pede 30); a v3 pede 35.
    ['ana', new CourseProgress(v12, [...done('q-telescopio', 'q-orbitas', 'q-diario'), { questId: 'q-cometas', version: 2 }])],
    // Observador com cálculo 45: continua.
    ['bia', new CourseProgress(v12, done('q-telescopio', 'q-orbitas', 'q-diario', 'q-cometas', 'q-eclipse'))],
    ['caio', new CourseProgress(v12, [])],
  ]);

  it('o admin vê quem cairia antes de publicar', () => {
    expect(students.get('ana')?.level().current.id).toBe('Observador');
    expect(publishImpact(v12, readDoc('astro-demo', 3), students)).toEqual([{ student: 'ana', from: 'Observador', to: 'Aprendiz' }]);
  });

  it('a versão nova não muda os pontos de ninguém', () => {
    const ana = students.get('ana') as CourseProgress;
    const after = ana.withHistory(new Map(v12).set(3, readDoc('astro-demo', 3)));
    expect([after.xp, after.attributes]).toEqual([ana.xp, ana.attributes]);
  });
});

describe('versão nova que tira uma fase em andamento', () => {
  it('o aluno a termina na versão dele: ela continua no Portal', () => {
    const v1 = readDoc('astro-demo', 1);
    const without = new Map([[1, v1], [2, { ...v1, phases: v1.phases.filter((p) => p.id !== 'fase-2') }]]);
    const p = new CourseProgress(without, done('q-telescopio', 'q-orbitas', 'q-diario', 'q-cometas'));
    expect(p.phases().map((x) => `${x.id}:${x.status}@${x.version}`)).toEqual(['fase-1:concluded@1', 'fase-3:locked@2', 'fase-2:in-progress@1']);
    expect(p.attempt('q-eclipse')).toEqual({ ok: true, completion: { questId: 'q-eclipse', version: 1 } });
  });
});

describe('fila offline com versões', () => {
  const v12 = history('astro-demo', [1, 2]);
  const started = new CourseProgress(v12, done('q-telescopio'));

  it('o servidor decide a versão: o aparelho guarda só o id da missão', () => {
    const r = applyQueue(started, ['q-orbitas', 'q-diario', 'q-mapa-ceu']);
    expect(r.progress.completions).toEqual([...done('q-telescopio', 'q-orbitas', 'q-diario')]);
    expect(r.rejected).toEqual([{ questId: 'q-mapa-ceu', code: 'PHASE_CONCLUDED' }]);
  });

  it('dois aparelhos com a mesma missão: conta uma vez, em qualquer ordem', () => {
    const a = applyQueue(applyQueue(started, ['q-orbitas']).progress, ['q-orbitas', 'q-diario']);
    const b = applyQueue(applyQueue(started, ['q-orbitas', 'q-diario']).progress, ['q-orbitas']);
    expect(a.progress.xp).toBe(5500);
    expect(b.progress.xp).toBe(5500);
    expect(new Set(a.progress.completions.map((c) => `${c.questId}@${c.version}`))).toEqual(new Set(b.progress.completions.map((c) => `${c.questId}@${c.version}`)));
  });

  it('a fase nunca mistura versões: o primeiro que chega ao servidor fixa a versão dela', () => {
    // Um aparelho começou a fase 1 vendo a v2 (q-mapa-ceu); o outro ainda via a v1 (q-diario).
    const fresh = new CourseProgress(v12, []);
    const v2First = applyQueue(fresh, ['q-mapa-ceu', 'q-diario']);
    expect(v2First.rejected).toEqual([{ questId: 'q-diario', code: 'QUEST_UNKNOWN' }]);
    expect(v2First.progress.phaseVersion('fase-1')).toBe(2);
    const done1 = applyQueue(new CourseProgress(v12, done('q-diario')), ['q-mapa-ceu']);
    expect(done1.rejected).toEqual([{ questId: 'q-mapa-ceu', code: 'QUEST_NOT_IN_PHASE_VERSION' }]);
    for (const p of [v2First.progress, done1.progress]) {
      const versions = new Set(p.completions.map((c) => c.version));
      expect(versions.size).toBe(1);
    }
  });
});
