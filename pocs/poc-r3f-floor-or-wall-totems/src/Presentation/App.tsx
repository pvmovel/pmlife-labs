// A página da PoC (US75): a sala 3D de 18 m com os objetos na parede ou no chão (React.lazy), o aviso do totem no
// alcance (E ou Assistir, esteja ele na parede ou no chão), o clique ou toque no totem, a tela cheia do vídeo (com a
// cena parada) e o editor do master: chão ou parede, até 5 por parede, e a sala nova.
import { lazy, Suspense, useCallback, useReducer, useRef, useState } from 'react';
import { STILL } from '../Domain/TouchJoystick';
import type { MoveInput } from '../Domain/Movement';
import { CLOSED, playerReducer, scenePaused, type PlayerEvent } from '../Domain/Player';
import { placementOf, roomTotems, toRoom, type Room } from '../Domain/Room';
import roomData from '../Content/room.json';
import { useGameHotkeys } from './hooks/useGameHotkeys';
import { RoomEditor } from './HUD/RoomEditor';
import { TouchJoystick } from './HUD/TouchJoystick';
import { VideoOverlay } from './HUD/VideoOverlay';
import { useI18n, type Language } from './i18n/I18n';

const RoomCanvas = lazy(() => import('./Engine3D/RoomCanvas'));

// A sala de exemplo é conferida ao abrir a página: conteúdo inválido falha aqui, não no meio da aula.
const SAMPLE = toRoom(roomData);
/** Quanto esperar o player responder antes do aviso. A demo aceita `?timeout=` (o e2e simula a rede bloqueada). */
const TIMEOUT_MS = Number(new URLSearchParams(window.location.search).get('timeout')) || 10_000;
const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const isCoarsePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

declare global {
  interface Window {
    /** Quadros desenhados pela cena (o e2e confere que ela para com o vídeo aberto). */
    __frames?: number;
  }
}

export function App({ timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  const { language, setLanguage, t } = useI18n();
  const [room, setRoom] = useState<Room>(SAMPLE);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [player, dispatchPlayer] = useReducer(playerReducer, CLOSED);
  const dispatch = useCallback((e: PlayerEvent) => dispatchPlayer(e), []);
  const paused = scenePaused(player);
  const [touch] = useState(isCoarsePointer);
  const joystick = useRef<MoveInput>(STILL);
  const readJoystick = useCallback(() => joystick.current, []);
  const onFrame = useCallback(() => {
    window.__frames = (window.__frames ?? 0) + 1;
  }, []);

  const totems = roomTotems(room);
  const nearby = totems.find((x) => x.id === nearbyId) ?? null;
  const open = useCallback((id: string) => dispatch({ type: 'open', totemId: id }), [dispatch]);
  const playing = player.status !== 'closed' ? totems.find((x) => x.id === player.totemId) : undefined;
  const onWall = room.items.filter((i) => placementOf(i) === 'wall').length;

  useGameHotkeys(
    useCallback(() => {
      if (nearbyId) open(nearbyId);
    }, [nearbyId, open]),
    !paused,
  );

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">
          {t('nav.back')}
        </a>
        <a className="btn" href="../../../catalogo/poc-r3f-floor-or-wall-totems/">
          {t('nav.docs')}
        </a>
      </nav>
      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>
      <div className="controls">
        <div className="group" role="group" aria-label={t('page.language')}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" aria-pressed={language === l.id} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scene" data-testid="scene" data-paused={paused || undefined}>
        <Suspense fallback={<p className="loader" role="status">{t('page.loading')}</p>}>
          <RoomCanvas
            key={`${room.halfSize}:${room.doorX}`}
            room={room}
            labelOf={t}
            ariaLabel={t('page.sceneLabel', { size: room.halfSize * 2, walls: onWall, floor: room.items.length - onWall, titles: room.items.map((x) => t(x.textKey)).join('; ') })}
            paused={paused}
            nearbyId={nearbyId}
            onNearbyChange={setNearbyId}
            onPick={open}
            touchInput={readJoystick}
            onFrame={onFrame}
          />
        </Suspense>
        {nearby && !paused && (
          <div className="prompt-region" aria-live="polite">
            <div className="prompt" data-testid="totem-prompt">
              <strong>{t('hud.nearTotem')}</strong>
              <span>{t(nearby.textKey)}</span>
              <div className="prompt-actions">
                <button type="button" onClick={() => open(nearby.id)}>
                  {t('hud.watch')} {!touch && <kbd>E</kbd>}
                </button>
              </div>
            </div>
          </div>
        )}
        {touch && !paused && <TouchJoystick inputRef={joystick} />}
      </div>
      {player.status !== 'closed' && playing && <VideoOverlay key={player.totemId} state={player} videoId={playing.videoId ?? ''} title={t(playing.textKey)} dispatch={dispatch} timeoutMs={timeoutMs} />}
      <section className="card">
        <h2>{t('page.keysTitle')}</h2>
        <ul className="keys">
          <li>{t('page.keysMove')}</li>
          <li>{t('page.keysInteract')}</li>
          <li>{t('page.keysClick')}</li>
          <li>{t('page.keysTouch')}</li>
        </ul>
        <p className="muted">
          {t('page.nearby')}: <strong data-testid="nearby">{nearby ? t(nearby.textKey) : t('page.nobody')}</strong>
        </p>
      </section>
      <RoomEditor room={room} onPublish={setRoom} />
    </main>
  );
}
