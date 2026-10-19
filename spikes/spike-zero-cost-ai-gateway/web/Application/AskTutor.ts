// Application: Ports e caso de uso do tutor. O caso de uso não sabe se a busca é BM25 nem se a IA é PHP.
import type { Hit, Passage } from '../Domain/Bm25';

export type AiErrorCode = 'INVALID_REQUEST' | 'RATE_LIMITED' | 'AI_UNAVAILABLE' | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

export class AiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(code);
    this.name = 'AiError';
  }
}

/** Port: busca no material do curso. */
export interface KnowledgeSearchPort {
  search(question: string, k: number): Hit[];
}

/** Port: o gateway de IA. Só manda persona, pergunta e trechos; o system prompt fica no servidor. */
export interface AiGatewayPort {
  /** @throws AiError */
  ask(request: { persona: string; message: string; context: string[] }): Promise<{ answer: string; provider: string }>;
}

export interface TutorAnswer {
  readonly answer: string;
  readonly provider: string;
  /** Trechos usados como contexto (a interface mostra de onde veio a resposta). */
  readonly sources: readonly Passage[];
}

/** Limites do gateway (iguais aos do ChatRequest.php): quem passar disso recebe INVALID_REQUEST. */
export const MAX_QUESTION = 500;
const MAX_CONTEXT_CHARS = 700;
const TOP_K = 3;

export class AskTutorUseCase {
  constructor(
    private readonly search: KnowledgeSearchPort,
    private readonly gateway: AiGatewayPort,
  ) {}

  /** @throws AiError */
  async execute(question: string): Promise<TutorAnswer> {
    const message = question.trim();
    if (message === '' || message.length > MAX_QUESTION) throw new AiError('INVALID_REQUEST');
    const sources = this.search.search(message, TOP_K).map((h) => h.passage);
    const context = sources.map((p) => `${p.title}: ${p.text}`.slice(0, MAX_CONTEXT_CHARS));
    const { answer, provider } = await this.gateway.ask({ persona: 'tutor', message, context });
    return { answer, provider, sources };
  }
}
