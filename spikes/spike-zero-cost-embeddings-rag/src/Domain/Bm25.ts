// Domain: busca lexical BM25 em TypeScript puro (sem servidor, sem embeddings, custo zero).
// Acha os trechos do material do curso que mais se parecem com a pergunta, para mandar como contexto à IA.

export interface Passage {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export interface Hit {
  readonly passage: Passage;
  readonly score: number;
}

// Palavras muito comuns em português: não ajudam a distinguir um trecho do outro.
const STOPWORDS = new Set(
  'a ao aos as com como da das de do dos e é em entre essa esse esta este eu foi há isso já mais mas me meu na nas no nos o os ou para pela pelo por qual quais quando que quem se sem ser sua seu são também tem um uma umas uns você vocês'.split(' '),
);

/** Minúsculas, sem acento, sem pontuação, sem stopwords e com um "s" final removido (luas ➔ lua). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** Índice BM25 (k1 = 1,2; b = 0,75, os valores clássicos). O título conta junto com o texto. */
export class Bm25Index {
  private readonly docs: { passage: Passage; terms: Map<string, number>; length: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(passages: readonly Passage[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.docs = passages.map((passage) => {
      const tokens = tokenize(`${passage.title} ${passage.text}`);
      const terms = new Map<string, number>();
      for (const t of tokens) terms.set(t, (terms.get(t) ?? 0) + 1);
      for (const t of terms.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { passage, terms, length: tokens.length };
    });
    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(this.docs.length, 1);
  }

  /** Os `k` trechos mais relevantes, do mais para o menos; trechos sem nenhum termo em comum ficam de fora. */
  search(query: string, k = 3): Hit[] {
    const n = this.docs.length;
    const terms = [...new Set(tokenize(query))];
    return this.docs
      .map((d) => {
        let score = 0;
        for (const t of terms) {
          const tf = d.terms.get(t) ?? 0;
          if (tf === 0) continue;
          const df = this.df.get(t) ?? 0;
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
          score += (idf * tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * d.length) / this.avgLength));
        }
        return { passage: d.passage, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
