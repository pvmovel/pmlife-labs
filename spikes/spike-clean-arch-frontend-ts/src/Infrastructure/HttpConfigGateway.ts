// Adapter HTTP do Port ConfigGateway. Conhece o contrato da API:
//   sucesso: {"status":"success","data":{"titulo_projeto_pt":"...","titulo_projeto_en":"..."}}
//   erro:    {"status":"error","error":{"code":"DB_UNAVAILABLE"}}
// Toda falha vira AppError com código estável; texto do servidor nunca sobe para a UI.
import { AppError } from '@application/AppError';
import type { ConfigGateway } from '@application/Ports/ConfigGateway';
import { ProjectTitles } from '@domain/ProjectTitles';

type FetchFn = typeof fetch;

interface SuccessEnvelope {
  status: 'success';
  data: { titulo_projeto_pt?: unknown; titulo_projeto_en?: unknown };
}

interface ErrorEnvelope {
  status: 'error';
  error: { code?: unknown };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export class HttpConfigGateway implements ConfigGateway {
  constructor(
    private readonly url: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  async getTitles(): Promise<ProjectTitles> {
    let response: Response;
    try {
      response = await this.fetchFn(this.url, { headers: { Accept: 'application/json' } });
    } catch {
      throw new AppError('NETWORK_ERROR');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR');
    }

    if (isObject(body) && body.status === 'error' && isObject(body.error)) {
      const code = (body as unknown as ErrorEnvelope).error.code;
      throw new AppError('API_ERROR', typeof code === 'string' ? code : undefined);
    }
    if (!response.ok) throw new AppError('HTTP_ERROR');

    if (!isObject(body) || body.status !== 'success' || !isObject(body.data)) {
      throw new AppError('INVALID_RESPONSE');
    }
    const { titulo_projeto_pt: pt, titulo_projeto_en: en } = (body as unknown as SuccessEnvelope).data;
    if (typeof pt !== 'string' || (en !== undefined && typeof en !== 'string')) {
      throw new AppError('INVALID_RESPONSE');
    }
    return ProjectTitles.create(pt, en ?? '');
  }
}
