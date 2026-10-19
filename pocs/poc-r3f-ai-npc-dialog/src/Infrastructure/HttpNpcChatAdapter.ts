// Infrastructure: o NPC responde por HTTP (POST JSON). Mesmo contrato do endpoint do produto:
//   { persona, message, history: [{ question, answer }], lang } ➔ { status: "success", data: { answer } }
//   erros: { status: "error", error: { code } }, com 400 INVALID_PERSONA para persona fora da lista branca.
import { NpcChatError, type NpcChatErrorCode, type NpcChatPort, type NpcChatRequest } from '../Application/TalkToNpc';

const KNOWN: readonly NpcChatErrorCode[] = ['INVALID_PERSONA', 'INVALID_REQUEST', 'RATE_LIMITED', 'AI_UNAVAILABLE'];

export class HttpNpcChatAdapter implements NpcChatPort {
  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async reply(request: NpcChatRequest): Promise<string> {
    let res: Response;
    let body: { status?: string; data?: { answer?: unknown }; error?: { code?: unknown } } | null;
    try {
      res = await this.fetcher(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
      body = await res.json().catch(() => null);
    } catch {
      throw new NpcChatError('NETWORK');
    }
    if (res.ok && body?.status === 'success' && typeof body.data?.answer === 'string') return body.data.answer;
    const code = body?.error?.code;
    throw new NpcChatError(KNOWN.includes(code as NpcChatErrorCode) ? (code as NpcChatErrorCode) : 'AI_UNAVAILABLE');
  }
}
