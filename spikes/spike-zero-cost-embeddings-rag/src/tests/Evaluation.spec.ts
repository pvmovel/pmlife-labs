// A avaliação da US33: recall@3 das 30 perguntas aprovadas no DoR, para o BM25 (o que o Co-Pilot usa hoje) e para as
// buscas semânticas a custo zero, sozinhas e híbridas (RRF com o BM25). Os vetores vêm de src/Content/vectors/, gerados
// uma vez pelo eval/ com os modelos reais; aqui só se recalcula a busca, sem rede e sem modelo.
// A tabela impressa é a que aparece na página do spike no catálogo do labs.
import { describe, expect, it } from 'vitest';
import { Bm25Index } from '@domain/Bm25';
import { decide, type Candidate } from '@domain/Decision';
import { rankByVector, recallAtK, reciprocalRankFusion, truncate, type EvalQuestion, type Ranker, type RecallReport, type Vector } from '@domain/Retrieval';
import kb from '../Content/knowledge_base.json';
import evalSet from '../Content/eval_questions.json';
import e5 from '../Content/vectors/e5-small.json';
import minilm from '../Content/vectors/minilm-l12.json';
import static1024 from '../Content/vectors/static-1024.json';
import static256 from '../Content/vectors/static-256-int8.json';

interface VectorFile {
  model: string;
  dims: number;
  downloadMB: number;
  perQueryMs: number;
  passages: Record<string, number[]>;
  questions: Record<string, number[]>;
}

const questions = evalSet.questions as EvalQuestion[];
const bm25 = new Bm25Index(kb.passages);
const bm25Rank: Ranker = (q) => bm25.search(q.question, kb.passages.length).map((h) => h.passage.id);

const vectorRanker = (file: VectorFile, dims?: number): Ranker => {
  const cut = (v: Vector) => (dims ? truncate(v, dims) : v);
  const passages = new Map(kb.passages.map((p) => [p.id, cut(file.passages[p.id])]));
  return (q) => rankByVector(cut(file.questions[q.id]), passages);
};
const hybrid = (r: Ranker): Ranker => (q) => reciprocalRankFusion([bm25Rank(q), r(q)]);

/** O e5-small com o vocabulário só do português: mesmo resultado nas palavras cobertas, ~29 MB (veja o README). */
const E5_TRIMMED_MB = 29;

interface Row {
  name: string;
  downloadMB: number;
  report: RecallReport;
}
const rows: Row[] = [];
const measure = (name: string, downloadMB: number, rank: Ranker) => {
  const report = recallAtK(questions, rank, 3);
  rows.push({ name, downloadMB, report });
  return report;
};

const files: [string, VectorFile][] = [
  ['e5-small', e5],
  ['minilm-l12', minilm],
  ['static-1024', static1024],
  ['static-256-int8', static256],
];

describe('US33: conjunto de avaliação e vetores', () => {
  it('30 perguntas (8 L, 22 P) e todo trecho esperado existe no material', () => {
    const ids = new Set(kb.passages.map((p) => p.id));
    expect(kb.passages).toHaveLength(26);
    expect(questions).toHaveLength(30);
    expect(questions.filter((q) => q.kind === 'L')).toHaveLength(8);
    for (const q of questions) for (const id of q.expected) expect(ids, `pergunta ${q.id}`).toContain(id);
  });

  it.each(files)('%s: um vetor por trecho e por pergunta, todos com a mesma dimensão e normalizados', (_, file) => {
    const all = [...kb.passages.map((p) => file.passages[p.id]), ...questions.map((q) => file.questions[q.id])];
    for (const v of all) {
      expect(v).toHaveLength(file.dims);
      expect(Math.hypot(...v)).toBeCloseTo(1, 3);
    }
  });
});

describe('US33: recall@3 de cada abordagem', () => {
  const baseline = measure('BM25 (hoje)', 0, bm25Rank);

  it('BM25 acerta as 8 perguntas que repetem termos e erra 6 paráfrases', () => {
    expect(baseline).toMatchObject({ hits: 24, paraphraseHits: 16, misses: [6, 10, 15, 16, 22, 26] });
  });

  const e5Report = measure('e5-small', e5.downloadMB, vectorRanker(e5));
  measure('e5-small + BM25 (híbrida)', e5.downloadMB, hybrid(vectorRanker(e5)));
  measure('minilm-l12', minilm.downloadMB, vectorRanker(minilm));
  measure('minilm-l12 + BM25 (híbrida)', minilm.downloadMB, hybrid(vectorRanker(minilm)));
  measure('static-1024', static1024.downloadMB, vectorRanker(static1024));
  const mrl = measure('static-1024 cortado em 256 (float)', static1024.downloadMB, vectorRanker(static1024, 256));
  const int8 = measure('static-256-int8', static256.downloadMB, vectorRanker(static256));
  measure('static-256-int8 + BM25 (híbrida)', static256.downloadMB, hybrid(vectorRanker(static256)));

  it('o melhor modelo (e5-small) acerta 28/30: +13,3 pontos, abaixo dos 15 do DoR', () => {
    expect(e5Report).toMatchObject({ hits: 28, misses: [16, 21] });
  });

  it('o corte Matryoshka em 256 dimensões e a quantização int8 não mudam o acerto do modelo estático', () => {
    expect(int8.hits).toBe(mrl.hits);
  });

  it('veredito: nenhuma busca semântica de até 30 MB ganha 15 pontos do BM25; fica o BM25', () => {
    const candidates: Candidate[] = rows.slice(1).map((r) => ({ name: r.name, recallPercent: r.report.percent, downloadMB: r.downloadMB }));
    // Teto do e5-small enxugado: o mesmo recall do completo, no tamanho estimado.
    candidates.push({ name: 'e5-small enxugado (teto)', recallPercent: e5Report.percent, downloadMB: E5_TRIMMED_MB });
    const verdict = decide({ name: 'BM25 (hoje)', recallPercent: baseline.percent, downloadMB: 0 }, candidates);

    const pct = (r: RecallReport) => `${r.hits}/${r.total} = ${r.percent.toFixed(1)}%`.padEnd(14);
    const lines = rows.map((r) => {
      const why = verdict.reasons.find((x) => x.name === r.name);
      return `${r.name.padEnd(36)} ${pct(r.report)} P ${`${r.report.paraphraseHits}/${r.report.paraphraseTotal}`.padEnd(6)} ${`${r.downloadMB} MB`.padEnd(9)} ${why ? `${why.gainPoints >= 0 ? '+' : ''}${why.gainPoints} pts, ${why.reason}` : 'referência'}  erros: ${r.report.misses.join(', ') || '-'}`;
    });
    const trimmed = verdict.reasons.at(-1)!;
    lines.push(`${'e5-small enxugado (teto)'.padEnd(36)} ${pct(e5Report)} ${''.padEnd(8)} ${`~${E5_TRIMMED_MB} MB`.padEnd(9)} +${trimmed.gainPoints} pts, ${trimmed.reason}`);
    console.log(['', 'recall@3 nas 30 perguntas (P = paráfrases):', ...lines, `veredito: ${verdict.adopt}`, ''].join('\n'));

    expect(verdict.adopt).toBe('BM25 (hoje)');
    expect(verdict.reasons.filter((r) => r.reason === 'adotada')).toEqual([]);
  });

  it('custo por pergunta: o estático é quase instantâneo; os transformers custam dezenas de ms no notebook', () => {
    expect(static256.perQueryMs).toBeLessThan(5);
    expect(e5.perQueryMs).toBeGreaterThan(static256.perQueryMs);
  });
});
