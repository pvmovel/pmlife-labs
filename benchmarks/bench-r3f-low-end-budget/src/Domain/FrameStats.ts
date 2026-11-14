// Resumo dos tempos de quadro de uma rodada do benchmark (US56). TypeScript puro: a mesma conta roda no navegador, nos
// testes e no script de comparação. O FPS "1% baixo" é o do quadro no percentil 99 do tempo: mostra os engasgos que a
// média esconde.

export interface FrameSummary {
  /** Quadros medidos (depois do aquecimento). */
  frames: number;
  /** Segundos medidos. */
  seconds: number;
  /** FPS médio da rodada: quadros ÷ segundos. */
  fpsAverage: number;
  /** FPS do quadro mediano. */
  fpsMedian: number;
  /** FPS do quadro no percentil 99 do tempo (o "1% baixo"). */
  fpsLow1: number;
  frameMsMedian: number;
  frameMsP95: number;
  frameMsMax: number;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Percentil `p` (0 a 100) de uma lista em ordem crescente, com interpolação linear entre os vizinhos. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const at = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** Resume os intervalos entre quadros, em milissegundos. Intervalos inválidos (zero, negativos, NaN) são ignorados. */
export function summarizeFrames(deltasMs: readonly number[]): FrameSummary {
  const valid = deltasMs.filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length === 0) return { frames: 0, seconds: 0, fpsAverage: 0, fpsMedian: 0, fpsLow1: 0, frameMsMedian: 0, frameMsP95: 0, frameMsMax: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const total = valid.reduce((s, d) => s + d, 0);
  const median = percentile(sorted, 50);
  return {
    frames: valid.length,
    seconds: round(total / 1000, 2),
    fpsAverage: round((valid.length * 1000) / total),
    fpsMedian: round(1000 / median),
    fpsLow1: round(1000 / percentile(sorted, 99)),
    frameMsMedian: round(median, 2),
    frameMsP95: round(percentile(sorted, 95), 2),
    frameMsMax: round(sorted[sorted.length - 1], 2),
  };
}

/** Mediana e máximo de uma série de contagens (draw calls, triângulos). */
export function countSummary(values: readonly number[]): { median: number; max: number } {
  if (values.length === 0) return { median: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { median: Math.round(percentile(sorted, 50)), max: sorted[sorted.length - 1] };
}
