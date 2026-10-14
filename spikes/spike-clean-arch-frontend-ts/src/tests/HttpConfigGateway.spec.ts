// Teste de contrato do adapter HTTP: o que a API pode responder ➔ o que a aplicação recebe.
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@application/AppError';
import { HttpConfigGateway } from '@infrastructure/HttpConfigGateway';

const reply = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

const failWith = async (gateway: HttpConfigGateway) => {
  try {
    await gateway.getTitles();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('deveria ter falhado');
};

describe('HttpConfigGateway (contrato da API)', () => {
  it('sucesso: lê os títulos do envelope {status, data}', async () => {
    const fetchFn = reply({ status: 'success', data: { titulo_projeto_pt: 'Título', titulo_projeto_en: 'Title' } });
    const titles = await new HttpConfigGateway('/api/config.php', fetchFn).getTitles();
    expect(titles.forLanguage('pt-BR')).toBe('Título');
    expect(titles.forLanguage('en-US')).toBe('Title');
    expect(fetchFn).toHaveBeenCalledWith('/api/config.php', expect.anything());
  });

  it('500 com envelope de erro: vira API_ERROR com o código da API, sem texto do servidor', async () => {
    const err = await failWith(new HttpConfigGateway('/x', reply({ status: 'error', error: { code: 'DB_UNAVAILABLE' } }, 500)));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('API_ERROR');
    expect(err.apiCode).toBe('DB_UNAVAILABLE');
  });

  it('500 sem JSON (ex.: página HTML de erro): vira HTTP_ERROR', async () => {
    const err = await failWith(new HttpConfigGateway('/x', reply('<h1>Internal Server Error: SQLSTATE...</h1>', 500)));
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.message).not.toContain('SQLSTATE');
  });

  it('200 com JSON inválido ou fora do contrato: vira INVALID_RESPONSE', async () => {
    expect((await failWith(new HttpConfigGateway('/x', reply('{não é json')))).code).toBe('INVALID_RESPONSE');
    expect((await failWith(new HttpConfigGateway('/x', reply({ titulo_projeto_pt: 'formato antigo' })))).code).toBe('INVALID_RESPONSE');
    expect((await failWith(new HttpConfigGateway('/x', reply({ status: 'success', data: { titulo_projeto_pt: 42 } })))).code).toBe('INVALID_RESPONSE');
  });

  it('falha de rede: vira NETWORK_ERROR', async () => {
    const err = await failWith(new HttpConfigGateway('/x', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))));
    expect(err.code).toBe('NETWORK_ERROR');
  });
});
