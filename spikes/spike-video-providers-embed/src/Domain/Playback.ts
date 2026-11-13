// O estado da tela do vídeo (o mesmo da US38), agora sem saber de plataforma: cada estratégia traduz a mensagem do
// player num `PlayerSignal`, e o prazo cobre quem não avisa nada (rede bloqueada, vídeo do Bunny inexistente ou com
// token, que respondem 404 ou ficam mudos).
import type { PlaybackFailure, PlayerSignal } from './VideoSource';

/** Carregando, tocando (o player respondeu) ou com o aviso. */
export type PlaybackState = { readonly status: 'loading' | 'ready' } | { readonly status: 'failed'; readonly reason: PlaybackFailure };

/** O que aconteceu: um sinal do player ou o prazo vencido. */
export type PlaybackEvent = PlayerSignal | { readonly type: 'timeout' };

/** A tela acabou de abrir. */
export const LOADING: PlaybackState = { status: 'loading' };

/** Quanto esperar o player responder antes do aviso (o mesmo do totem do YouTube). */
export const PLAYER_TIMEOUT_MS = 10_000;

/** O próximo estado: o prazo só vale enquanto carrega; um erro depois de tocar também mostra o aviso. */
export function playbackReducer(state: PlaybackState, event: PlaybackEvent): PlaybackState {
  switch (event.type) {
    case 'ready':
      return state.status === 'loading' ? { status: 'ready' } : state;
    case 'error':
      return state.status === 'failed' ? state : { status: 'failed', reason: event.reason };
    case 'timeout':
      return state.status === 'loading' ? { status: 'failed', reason: 'noResponse' } : state;
  }
}
