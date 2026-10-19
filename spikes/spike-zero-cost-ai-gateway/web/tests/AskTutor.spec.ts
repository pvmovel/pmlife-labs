import { describe, expect, it, vi } from 'vitest';
import { AiError, AskTutorUseCase, type AiGatewayPort } from '../Application/AskTutor';
import kb from '../Content/knowledge_base.json';
import { HttpAiGatewayAdapter, StaticRagSearchAdapter } from '../Infrastructure/adapters';

const search = new StaticRagSearchAdapter(kb.passages);

describe('AskTutorUseCase (Gherkin: busca fundamentada via Static RAG)', () => {
  it('recupera os trechos relevantes e os envia como contexto ao gateway, com a persona; nunca um system prompt', async () => {
    const gateway: AiGatewayPort = { ask: vi.fn(async () => ({ answer: 'Na lua cheia.', provider: 'gemini' })) };
    const r = await new AskTutorUseCase(search, gateway).execute('  Quando acontece o eclipse lunar?  ');

    const sent = vi.mocked(gateway.ask).mock.calls[0][0];
    expect(sent.persona).toBe('tutor');
    expect(sent.message).toBe('Quando acontece o eclipse lunar?');
    expect(sent.context[0]).toMatch(/^Eclipse lunar: /);
    expect(sent.context.length).toBeLessThanOrEqual(3);
    expect(sent.context.every((c) => c.length <= 700)).toBe(true);
    expect(Object.keys(sent)).toEqual(['persona', 'message', 'context']);
    expect(r).toMatchObject({ answer: 'Na lua cheia.', provider: 'gemini' });
    expect(r.sources[0].id).toBe('eclipse-lunar');
  });

  it('pergunta vazia ou longa demais nem chega ao gateway', async () => {
    const gateway: AiGatewayPort = { ask: vi.fn() };
    const uc = new AskTutorUseCase(search, gateway);
    await expect(uc.execute('   ')).rejects.toEqual(new AiError('INVALID_REQUEST'));
    await expect(uc.execute('x'.repeat(501))).rejects.toEqual(new AiError('INVALID_REQUEST'));
    expect(gateway.ask).not.toHaveBeenCalled();
  });
});

describe('HttpAiGatewayAdapter (contrato do ai_chat.php)', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const ask = (fetcher: typeof fetch) => new HttpAiGatewayAdapter('/ai_chat.php', fetcher).ask({ persona: 'tutor', message: 'oi', context: [] });

  it('sucesso: devolve a resposta e quem respondeu', async () => {
    const f = reply(200, { status: 'success', data: { answer: 'olá', provider: 'groq' } });
    await expect(ask(f)).resolves.toEqual({ answer: 'olá', provider: 'groq' });
    expect(f).toHaveBeenCalledWith('/ai_chat.php', expect.objectContaining({ method: 'POST' }));
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [503, 'AI_UNAVAILABLE'],
    [400, 'INVALID_REQUEST'],
  ])('HTTP %i com envelope de erro ➔ %s', async (status, code) => {
    await expect(ask(reply(status, { status: 'error', error: { code } }))).rejects.toEqual(new AiError(code as never));
  });

  it('código desconhecido, corpo sem JSON ou rede fora viram códigos estáveis', async () => {
    await expect(ask(reply(500, { status: 'error', error: { code: 'SERVER_ERROR' } }))).rejects.toEqual(new AiError('INVALID_RESPONSE'));
    await expect(ask(vi.fn(async () => new Response('<html>403 Forbidden</html>', { status: 403 })))).rejects.toEqual(new AiError('INVALID_RESPONSE'));
    await expect(ask(vi.fn(async () => Promise.reject(new TypeError('offline'))))).rejects.toEqual(new AiError('NETWORK_ERROR'));
  });
});
