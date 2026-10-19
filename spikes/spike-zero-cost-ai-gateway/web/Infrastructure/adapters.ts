// Infrastructure: o BM25 sobre a base estática e o gateway HTTP (ai_chat.php).
import type { AiGatewayPort, KnowledgeSearchPort } from '../Application/AskTutor';
import { AiError, type AiErrorCode } from '../Application/AskTutor';
import { Bm25Index, type Passage } from '../Domain/Bm25';

export class StaticRagSearchAdapter implements KnowledgeSearchPort {
  private readonly index: Bm25Index;
  constructor(passages: readonly Passage[]) {
    this.index = new Bm25Index(passages);
  }
  search(question: string, k: number) {
    return this.index.search(question, k);
  }
}

const KNOWN: AiErrorCode[] = ['INVALID_REQUEST', 'RATE_LIMITED', 'AI_UNAVAILABLE'];

export class HttpAiGatewayAdapter implements AiGatewayPort {
  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async ask(request: { persona: string; message: string; context: string[] }) {
    let res: Response;
    try {
      res = await this.fetcher(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    } catch {
      throw new AiError('NETWORK_ERROR');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new AiError('INVALID_RESPONSE');
    }
    const env = body as { status?: string; data?: { answer?: unknown; provider?: unknown }; error?: { code?: unknown } };
    if (res.ok && env.status === 'success' && typeof env.data?.answer === 'string') {
      return { answer: env.data.answer, provider: typeof env.data.provider === 'string' ? env.data.provider : '?' };
    }
    const code = env.error?.code;
    throw new AiError(KNOWN.includes(code as AiErrorCode) ? (code as AiErrorCode) : 'INVALID_RESPONSE');
  }
}
