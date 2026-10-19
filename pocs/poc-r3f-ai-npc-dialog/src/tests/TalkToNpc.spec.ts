import { describe, expect, it, vi } from 'vitest';
import { MAX_NPC_MESSAGE, NpcChatError, recentHistory, TalkToNpcUseCase, type NpcChatPort, type Turn } from '../Application/TalkToNpc';
import { HttpNpcChatAdapter } from '../Infrastructure/HttpNpcChatAdapter';

const turns = (n: number): Turn[] => Array.from({ length: n }, (_, i) => ({ question: `q${i + 1}`, answer: `a${i + 1}` }));
const port = (answer = 'ok') => ({ reply: vi.fn<NpcChatPort['reply']>().mockResolvedValue(answer) });

describe('TalkToNpcUseCase (memória curta: 3 trocas)', () => {
  it('envia persona, pergunta sem espaços nas pontas, idioma e as 3 últimas trocas', async () => {
    const chat = port('resposta');
    const turn = await new TalkToNpcUseCase(chat).execute('museum_guide', '  E o relógio?  ', turns(5), 'pt-BR');
    expect(chat.reply).toHaveBeenCalledWith({ persona: 'museum_guide', message: 'E o relógio?', history: turns(5).slice(2), lang: 'pt-BR' });
    expect(turn).toEqual({ question: 'E o relógio?', answer: 'resposta' });
  });

  it('com menos de 3 trocas, vão todas; a primeira pergunta vai sem histórico', () => {
    expect(recentHistory(turns(2))).toEqual(turns(2));
    expect(recentHistory([])).toEqual([]);
    expect(recentHistory(turns(4), 0)).toEqual([]);
  });

  it('pergunta vazia ou longa demais nem chega ao servidor', async () => {
    const chat = port();
    const uc = new TalkToNpcUseCase(chat);
    await expect(uc.execute('p', '   ', [], 'pt-BR')).rejects.toMatchObject({ code: 'EMPTY' });
    await expect(uc.execute('p', 'x'.repeat(MAX_NPC_MESSAGE + 1), [], 'pt-BR')).rejects.toMatchObject({ code: 'TOO_LONG' });
    expect(chat.reply).not.toHaveBeenCalled();
  });
});

describe('HttpNpcChatAdapter (contrato do npc_chat.php)', () => {
  const json = (status: number, body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const req = { persona: 'astronomer', message: 'oi', history: turns(1), lang: 'en-US' };

  it('POST JSON com o pedido inteiro e devolve data.answer', async () => {
    const f = json(200, { status: 'success', data: { answer: 'olá' } });
    expect(await new HttpNpcChatAdapter('/npc_chat.php', f).reply(req)).toBe('olá');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/npc_chat.php');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(req);
  });

  it('400 INVALID_PERSONA vira NpcChatError com o mesmo código', async () => {
    const f = json(400, { status: 'error', error: { code: 'INVALID_PERSONA' } });
    await expect(new HttpNpcChatAdapter('/x', f).reply(req)).rejects.toEqual(new NpcChatError('INVALID_PERSONA'));
  });

  it('código desconhecido, corpo que não é JSON ou sucesso sem resposta ➔ AI_UNAVAILABLE; falha de rede ➔ NETWORK', async () => {
    await expect(new HttpNpcChatAdapter('/x', json(500, { status: 'error', error: { code: 'SERVER_ERROR' } })).reply(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(new HttpNpcChatAdapter('/x', vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 502 }))).reply(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(new HttpNpcChatAdapter('/x', json(200, { status: 'success', data: {} })).reply(req)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(new HttpNpcChatAdapter('/x', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))).reply(req)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
