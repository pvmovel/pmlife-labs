// A tela cheia do vídeo: por cima da cena, só o básico do PMLife (a marca, o título do totem, o botão de fechar e a
// moldura); o resto é o player do YouTube sem cookies de rastreamento antes do play (youtube-nocookie.com). O player
// avisa a página por postMessage (o protocolo do `enablejsapi=1`): pronto, ou o código do erro. Nenhum script do
// YouTube é carregado na página. Sem resposta a tempo (a rede bloqueia o YouTube, ou caiu), aparece o aviso, com o
// link para abrir no YouTube. Esc e o botão fecham; o foco fica preso na janela e volta ao jogo ao fechar.
import { useEffect, useId, useRef } from 'react';
import { embedUrl, watchUrl } from '../../Domain/YouTube';
import type { PlayerEvent, PlayerState } from '../../Domain/Player';
import { useI18n } from '../i18n/I18n';

const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';
const FOCUSABLE = 'a[href], button:not([disabled]), iframe';

/** O aviso que o player manda (texto JSON ou objeto), já lido. */
export function readPlayerMessage(data: unknown): PlayerEvent | null {
  let m: unknown = data;
  if (typeof data === 'string') {
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof m !== 'object' || m === null) return null;
  const { event, info } = m as { event?: unknown; info?: unknown };
  if (event === 'onReady') return { type: 'ready' };
  if (event === 'onError' && typeof info === 'number') return { type: 'error', code: info };
  return null;
}

export function VideoOverlay({
  state,
  videoId,
  title,
  dispatch,
  timeoutMs,
}: {
  state: Exclude<PlayerState, { status: 'closed' }>;
  videoId: string;
  title: string;
  dispatch: (e: PlayerEvent) => void;
  /** Quanto esperar o player responder antes do aviso. */
  timeoutMs: number;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const src = embedUrl(videoId, window.location.origin);
  const close = () => dispatch({ type: 'close' });

  // Ouve o player (só da origem dele) e desiste depois do prazo.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame.current?.contentWindow) return;
      const event = readPlayerMessage(e.data);
      if (event) dispatch(event);
    };
    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => dispatch({ type: 'timeout' }), timeoutMs);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };
  }, [dispatch, timeoutMs, videoId]);

  // O player só fala com quem pediu para ouvir (o protocolo do enablejsapi). Como a API oficial, o pedido se repete
  // enquanto o vídeo carrega: o primeiro pode chegar antes de o player estar pronto para ouvir.
  const loading = state.status === 'loading';
  useEffect(() => {
    if (!loading) return;
    const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), PLAYER_ORIGIN);
    const timer = window.setInterval(listen, 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  // Foco preso na janela; Esc fecha; ao fechar, o foco volta para onde estava.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch({ type: 'close' });
        return;
      }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [dispatch]);

  return (
    <div ref={box} className="video-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="video-overlay" data-status={state.status}>
      <header className="video-head">
        <span className="video-brand" aria-hidden="true">
          {t('player.brand')}
        </span>
        <h2 id={titleId}>{t('player.label', { title })}</h2>
        <button type="button" className="video-close" onClick={close} data-autofocus>
          {t('hud.close')} <kbd>Esc</kbd>
        </button>
      </header>
      <div className="video-frame">
        {state.status === 'failed' ? (
          <div className="video-failed" role="alert">
            <p>{t(`player.failed.${state.reason}`)}</p>
            <a className="btn" href={watchUrl(videoId)} target="_blank" rel="noopener noreferrer">
              {t('player.openOnYouTube')}
            </a>
          </div>
        ) : (
          <>
            {state.status === 'loading' && (
              <p className="video-loading" role="status">
                {t('player.loading')}
              </p>
            )}
            <iframe
              ref={frame}
              src={src}
              title={t('player.frameTitle', { title })}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </>
        )}
      </div>
      <p className="video-privacy">{t('player.privacy')}</p>
    </div>
  );
}
