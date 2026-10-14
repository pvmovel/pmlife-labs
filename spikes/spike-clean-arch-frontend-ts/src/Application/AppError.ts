// Erro de aplicação com código estável. A UI traduz o código; nunca exibe texto vindo do servidor.
export type AppErrorCode = 'NETWORK_ERROR' | 'HTTP_ERROR' | 'API_ERROR' | 'INVALID_RESPONSE';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    /** Código de negócio devolvido pela API (ex.: DB_UNAVAILABLE), quando houver. */
    readonly apiCode?: string,
  ) {
    super(code);
    this.name = 'AppError';
  }
}
