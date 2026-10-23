// Domain: a regra de decisão aprovada no DoR da US33, escrita como código para o teste não depender de leitura humana.
// Adota uma busca semântica só se ela cabe no download aceito e ganha pelo menos `minGainPoints` de recall@3 do BM25.

/** Uma abordagem medida: o recall@3 e o download que o aluno faria na primeira pergunta. */
export interface Candidate {
  readonly name: string;
  /** recall@3 em pontos percentuais. */
  readonly recallPercent: number;
  /** Download em MB (0 para o BM25, que já vem no bundle). */
  readonly downloadMB: number;
}

/** O veredito: a abordagem adotada (ou o BM25) e o motivo de cada candidata (o ganho pesa antes do tamanho). */
export interface Verdict {
  readonly adopt: string;
  readonly reasons: readonly { readonly name: string; readonly gainPoints: number; readonly reason: 'adotada' | 'ganho insuficiente' | 'download acima do limite' }[];
}

/**
 * Escolhe, entre as candidatas que cabem em `maxDownloadMB` e ganham pelo menos `minGainPoints` do BM25, a de maior
 * recall (no empate, a de menor download). Nenhuma passou: fica o BM25.
 */
export function decide(baseline: Candidate, candidates: readonly Candidate[], minGainPoints = 15, maxDownloadMB = 30): Verdict {
  const gain = (c: Candidate) => Math.round((c.recallPercent - baseline.recallPercent) * 10) / 10;
  const eligible = candidates
    .filter((c) => c.downloadMB <= maxDownloadMB && gain(c) >= minGainPoints)
    .sort((a, b) => b.recallPercent - a.recallPercent || a.downloadMB - b.downloadMB);
  const adopt = eligible[0]?.name ?? baseline.name;
  return {
    adopt,
    reasons: candidates.map((c) => ({
      name: c.name,
      gainPoints: gain(c),
      reason: c.name === adopt ? 'adotada' : gain(c) < minGainPoints ? 'ganho insuficiente' : 'download acima do limite',
    })),
  };
}
