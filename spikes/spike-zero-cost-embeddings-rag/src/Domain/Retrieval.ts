// Domain: as peças da comparação, em TypeScript puro. Busca por vetores (cosseno), fusão híbrida (RRF), corte de
// dimensões (Matryoshka) e a métrica recall@k. Os vetores chegam prontos: quem os calcula é o eval/ (fora do domínio).

/** Um vetor de embedding (já normalizado ou não). */
export type Vector = readonly number[];

/** Uma pergunta do conjunto de avaliação e os trechos que contam como acerto. */
export interface EvalQuestion {
  readonly id: number;
  /** L: repete termos do trecho; P: paráfrase. */
  readonly kind: 'L' | 'P';
  readonly question: string;
  readonly expected: readonly string[];
}

/** Uma busca: recebe a pergunta e devolve os ids dos trechos, do mais para o menos relevante. */
export type Ranker = (question: EvalQuestion) => readonly string[];

/** Resultado do recall@k num conjunto de perguntas. */
export interface RecallReport {
  readonly hits: number;
  readonly total: number;
  /** Acertos só nas paráfrases (kind P). */
  readonly paraphraseHits: number;
  readonly paraphraseTotal: number;
  /** Ids das perguntas que ficaram sem nenhum trecho esperado no top k. */
  readonly misses: readonly number[];
  /** Em pontos percentuais (0 a 100). */
  readonly percent: number;
}

/** Escala o vetor para comprimento 1 (o vetor nulo continua nulo). */
export function normalize(v: Vector): number[] {
  const n = Math.hypot(...v);
  return n === 0 ? [...v] : v.map((x) => x / n);
}

/** Produto interno; com vetores normalizados, é o cosseno. */
export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`dimensões diferentes: ${a.length} e ${b.length}`);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Corte Matryoshka: modelos treinados com MRL concentram a informação nas primeiras dimensões, então dá para guardar
 * só as `dims` primeiras (e renormalizar) e diminuir o arquivo na mesma proporção.
 */
export function truncate(v: Vector, dims: number): number[] {
  return normalize(v.slice(0, dims));
}

/** Ordena os trechos pelo cosseno com a pergunta; empate fica na ordem do material. */
export function rankByVector(query: Vector, passages: ReadonlyMap<string, Vector>): string[] {
  return [...passages]
    .map(([id, v], i) => ({ id, score: dot(query, v), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Fusão por posição (Reciprocal Rank Fusion): cada lista dá 1/(k + posição) ao trecho. Não precisa calibrar a escala
 * do BM25 contra a do cosseno, por isso é a forma padrão de busca híbrida. k = 60 é o valor do artigo original.
 */
export function reciprocalRankFusion(rankings: readonly (readonly string[])[], k = 60): string[] {
  const score = new Map<string, number>();
  const first = new Map<string, number>();
  let order = 0;
  for (const ranking of rankings) {
    ranking.forEach((id, pos) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + pos + 1));
      if (!first.has(id)) first.set(id, order++);
    });
  }
  return [...score].sort((a, b) => b[1] - a[1] || first.get(a[0])! - first.get(b[0])!).map(([id]) => id);
}

/** recall@k: a fração das perguntas com pelo menos um trecho esperado entre os `k` primeiros. */
export function recallAtK(questions: readonly EvalQuestion[], rank: Ranker, k = 3): RecallReport {
  const misses: number[] = [];
  let paraphraseHits = 0;
  for (const q of questions) {
    const top = rank(q).slice(0, k);
    if (q.expected.some((id) => top.includes(id))) {
      if (q.kind === 'P') paraphraseHits++;
    } else {
      misses.push(q.id);
    }
  }
  const hits = questions.length - misses.length;
  return {
    hits,
    total: questions.length,
    paraphraseHits,
    paraphraseTotal: questions.filter((q) => q.kind === 'P').length,
    misses,
    percent: questions.length === 0 ? 0 : (100 * hits) / questions.length,
  };
}
