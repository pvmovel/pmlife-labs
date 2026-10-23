// As peças da comparação, isoladas: cosseno, corte Matryoshka, fusão RRF, recall@k e a regra de decisão do DoR.
import { describe, expect, it } from 'vitest';
import { decide } from '@domain/Decision';
import { dot, normalize, rankByVector, recallAtK, reciprocalRankFusion, truncate, type EvalQuestion } from '@domain/Retrieval';

const q = (id: number, expected: string[], kind: 'L' | 'P' = 'P'): EvalQuestion => ({ id, kind, question: `q${id}`, expected });

describe('vetores', () => {
  it('normaliza para comprimento 1 e o produto interno vira cosseno', () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(normalize([0, 0])).toEqual([0, 0]);
    expect(dot(normalize([1, 1]), normalize([1, 1]))).toBeCloseTo(1);
    expect(() => dot([1], [1, 2])).toThrow('dimensões diferentes');
  });

  it('o corte Matryoshka guarda as primeiras dimensões e renormaliza', () => {
    expect(truncate([3, 4, 12], 2)).toEqual([0.6, 0.8]);
  });

  it('ordena pelo cosseno; empate fica na ordem do material', () => {
    const passages = new Map([
      ['a', [1, 0]],
      ['b', [0, 1]],
      ['c', [0, 1]],
    ]);
    expect(rankByVector([0, 1], passages)).toEqual(['b', 'c', 'a']);
  });
});

describe('fusão híbrida (RRF)', () => {
  it('quem aparece bem nas duas listas sobe; quem só aparece numa fica atrás', () => {
    expect(reciprocalRankFusion([
      ['x', 'y', 'z'],
      ['y', 'w', 'x'],
    ])).toEqual(['y', 'x', 'w', 'z']);
  });

  it('com uma lista só, mantém a ordem dela', () => {
    expect(reciprocalRankFusion([['b', 'a', 'c']])).toEqual(['b', 'a', 'c']);
  });
});

describe('recall@k', () => {
  it('conta a pergunta com pelo menos um trecho esperado no top k e separa as paráfrases', () => {
    const qs = [q(1, ['a']), q(2, ['b', 'z']), q(3, ['c'], 'L'), q(4, ['d'])];
    const ranks: Record<number, string[]> = { 1: ['a', 'x', 'y'], 2: ['x', 'y', 'z', 'b'], 3: ['c'], 4: ['x', 'y', 'w', 'd'] };
    const r = recallAtK(qs, (x) => ranks[x.id], 3);
    expect(r).toEqual({ hits: 3, total: 4, paraphraseHits: 2, paraphraseTotal: 3, misses: [4], percent: 75 });
    expect(recallAtK(qs, (x) => ranks[x.id], 4).hits).toBe(4);
  });
});

describe('regra de decisão do DoR', () => {
  const bm25 = { name: 'BM25', recallPercent: 80, downloadMB: 0 };

  it('adota a candidata que cabe no download e ganha 15 pontos ou mais', () => {
    const v = decide(bm25, [
      { name: 'grande', recallPercent: 100, downloadMB: 135 },
      { name: 'pequena', recallPercent: 95, downloadMB: 29 },
      { name: 'fraca', recallPercent: 90, downloadMB: 8 },
    ]);
    expect(v.adopt).toBe('pequena');
    expect(v.reasons.map((r) => r.reason)).toEqual(['download acima do limite', 'adotada', 'ganho insuficiente']);
  });

  it('nenhuma passou: fica o BM25 (ganho de 14,9 pontos não basta)', () => {
    expect(decide(bm25, [{ name: 'quase', recallPercent: 94.9, downloadMB: 10 }]).adopt).toBe('BM25');
  });
});
