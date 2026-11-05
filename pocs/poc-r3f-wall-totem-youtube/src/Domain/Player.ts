// Domain: o estado da tela do vídeo, como uma máquina de estados pura (a Presentation só despacha eventos e desenha).
// TypeScript puro.

/** Por que o vídeo não toca aqui. */
export type PlayerFailure =
  /** Removido, privado ou inexistente (erros 2, 5 e 100 do player). */
  | 'unavailable'
  /**
   * Erros 101 e 150: o dono não deixa incorporar. Na prática, o player também manda o 150 para um vídeo inexistente
   * ou privado (conferido com o YouTube de verdade), então o aviso cobre os dois casos.
   */
  | 'embedBlocked'
  /** O player não respondeu a tempo: a rede (a escola, o país) bloqueia o YouTube, ou o aparelho está sem internet. */
  | 'noResponse';

export type PlayerState =
  | { readonly status: 'closed' }
  | { readonly status: 'loading'; readonly totemId: string }
  | { readonly status: 'ready'; readonly totemId: string }
  | { readonly status: 'failed'; readonly totemId: string; readonly reason: PlayerFailure };

export type PlayerEvent =
  | { readonly type: 'open'; readonly totemId: string }
  | { readonly type: 'ready' }
  | { readonly type: 'error'; readonly code: number }
  | { readonly type: 'timeout' }
  | { readonly type: 'close' };

export const CLOSED: PlayerState = { status: 'closed' };

/** O motivo da falha pelo código de erro do player do YouTube. */
export function failureOf(code: number): PlayerFailure {
  return code === 101 || code === 150 ? 'embedBlocked' : 'unavailable';
}

/**
 * O próximo estado. Um aviso que chega depois de fechar (ou de um vídeo para outro) não muda nada.
 *
 * @param state - O estado atual.
 * @param event - O que aconteceu.
 * @returns O estado novo (o mesmo objeto se nada muda).
 */
export function playerReducer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case 'open':
      return { status: 'loading', totemId: event.totemId };
    case 'close':
      return state.status === 'closed' ? state : CLOSED;
    case 'ready':
      return state.status === 'loading' ? { status: 'ready', totemId: state.totemId } : state;
    case 'error':
      return state.status === 'loading' || state.status === 'ready' ? { status: 'failed', totemId: state.totemId, reason: failureOf(event.code) } : state;
    case 'timeout':
      return state.status === 'loading' ? { status: 'failed', totemId: state.totemId, reason: 'noResponse' } : state;
  }
}

/** A cena 3D para de redesenhar enquanto o vídeo está aberto (o vídeo usa a CPU e a bateria sozinho). */
export const scenePaused = (state: PlayerState): boolean => state.status !== 'closed';
