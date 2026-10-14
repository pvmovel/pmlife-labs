// Textos da UI por código (no produto, isto vem do i18n). Nunca exibimos mensagem do servidor.
import type { AppErrorCode } from '@application/AppError';
import type { Language } from '@domain/ProjectTitles';

export const messages: Record<Language, { loading: string; errors: Record<AppErrorCode, string> }> = {
  'pt-BR': {
    loading: 'Carregando…',
    errors: {
      NETWORK_ERROR: 'Sem conexão com o servidor.',
      HTTP_ERROR: 'O servidor respondeu com erro.',
      API_ERROR: 'O serviço está indisponível no momento.',
      INVALID_RESPONSE: 'Resposta inesperada do servidor.',
    },
  },
  'en-US': {
    loading: 'Loading…',
    errors: {
      NETWORK_ERROR: 'Could not reach the server.',
      HTTP_ERROR: 'The server returned an error.',
      API_ERROR: 'The service is unavailable right now.',
      INVALID_RESPONSE: 'Unexpected server response.',
    },
  },
};
