import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toCampus } from '../Domain/Campus';
import { exitPoint, toInteriors, type Station } from '../Domain/Interior';
import { startIsFree, type AvatarState, type MoveInput } from '../Domain/Movement';
import { STILL } from '../Domain/TouchJoystick';
import campusData from '../Content/campus.json';
import interiorsData from '../Content/interiors.json';
import { useGameHotkeys, type GameHotkey } from './hooks/useGameHotkeys';
import { BuildingInfoModal } from './HUD/BuildingInfoModal';
import { BuildingRoomPanel } from './HUD/BuildingRoomPanel';
import { HelpModal } from './HUD/HelpModal';
import { InteractionPrompt } from './HUD/InteractionPrompt';
import { StationPrompt } from './HUD/StationPrompt';
import { TouchJoystick } from './HUD/TouchJoystick';
import { useI18n, type Language } from './i18n/I18n';
import { initialMode, isCoarsePointer, NavigationModeToggle, type NavigationMode } from './NavigationModeToggle';

const AvatarCanvas = lazy(() => import('./Engine3D/AvatarCanvas'));
// US32: a sala tem o próprio chunk, baixado só na primeira entrada.
const InteriorCanvas = lazy(() => import('./Engine3D/InteriorCanvas'));

const CAMPUS = toCampus(campusData);
if (!startIsFree(CAMPUS)) throw new Error('campus.json: o ponto de partida do avatar está dentro de um prédio ou fora do mapa');
// Interiores validados contra o campus ao abrir a página: conteúdo inválido falha aqui, não no meio do jogo.
const INTERIORS = toInteriors(interiorsData, CAMPUS);
const REWARD = new Map([...INTERIORS.values()].flatMap((i) => i.stations.map((s): [string, number] => [s.id, s.rewardXp])));
/** Duração do escurecer/clarear entre o campus e a sala. */
const FADE_MS = 200;

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const fmt = (n: number) => n.toFixed(1);

type OpenWindow = 'info' | 'room' | 'help' | null;
type Place = { kind: 'campus' } | { kind: 'interior'; buildingId: string };

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<NavigationMode>(initialMode);
  const [avatar, setAvatar] = useState<AvatarState>(CAMPUS.start);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenWindow>(null);
  const lastHud = useRef(0);
  // US32: onde o aluno está (campus ou dentro de um prédio), por onde ele volta e as missões concluídas nas estações.
  const [place, setPlace] = useState<Place>({ kind: 'campus' });
  const [campusStart, setCampusStart] = useState(CAMPUS.start);
  const [campusKey, setCampusKey] = useState(0);
  const [fading, setFading] = useState(false);
  const [entryMs, setEntryMs] = useState<number | null>(null);
  const enteredAt = useRef(0);
  const [stationId, setStationId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const inside = place.kind === 'interior';
  const interior = place.kind === 'interior' ? (INTERIORS.get(place.buildingId) ?? null) : null;
  const station = interior?.stations.find((s) => s.id === stationId) ?? null;
  const xp = [...completed].reduce((sum, id) => sum + (REWARD.get(id) ?? 0), 0);
  const campus = useMemo(() => ({ ...CAMPUS, start: campusStart }), [campusStart]);
  // Joystick (US29): só no toque, só no modo Avatar e sem janela aberta. A entrada fica num ref lido a cada quadro.
  const [touch] = useState(isCoarsePointer);
  const joystick = useRef<MoveInput>(STILL);
  const readJoystick = useCallback(() => joystick.current, []);
  const showJoystick = touch && (mode === 'avatar' || inside) && open === null && !fading;
  // O alvo das teclas e dos botões: no modo Avatar, o prédio no alcance; no Orbital, o que o aluno clicou ou tocou.
  const targetId = mode === 'orbital' ? selectedId : nearbyId;
  const target = CAMPUS.buildings.find((b) => b.id === targetId) ?? null;

  const onMove = useCallback((s: AvatarState) => {
    const now = performance.now();
    if (now - lastHud.current < 100) return;
    lastHud.current = now;
    setAvatar(s);
  }, []);

  // Entrar: com interior, escurece e abre a sala (avatar na porta, de frente para o fundo); sem interior, o painel de
  // missões (a alternativa, também acessível por leitor de tela).
  const enter = useCallback((buildingId: string) => {
    if (!INTERIORS.has(buildingId)) {
      setOpen('room');
      return;
    }
    enteredAt.current = performance.now();
    setEntryMs(null);
    setFading(true);
    window.setTimeout(() => {
      setPlace({ kind: 'interior', buildingId });
      setNearbyId(null);
      setSelectedId(null);
      setStationId(null);
      setMode('avatar');
    }, FADE_MS);
  }, []);
  const onInteriorReady = useCallback(() => {
    setEntryMs(Math.round(performance.now() - enteredAt.current));
    setFading(false);
  }, []);
  // Sair (pela porta ou com Esc): escurece e volta ao campus com o avatar diante da porta do prédio, olhando para fora.
  const exit = useCallback(() => {
    if (place.kind !== 'interior') return;
    const building = CAMPUS.buildings.find((b) => b.id === place.buildingId);
    if (!building) return;
    setFading(true);
    window.setTimeout(() => {
      setCampusStart(exitPoint(building));
      setCampusKey((k) => k + 1);
      setPlace({ kind: 'campus' });
      setStationId(null);
      setFading(false);
    }, FADE_MS);
  }, [place]);
  const complete = useCallback((s: Station) => setCompleted((prev) => new Set(prev).add(s.id)), []);

  // H funciona em qualquer lugar. No campus: I e E com um prédio no alcance (Avatar) ou selecionado (Orbital). Na sala:
  // E usa a estação no alcance. Com uma janela aberta, os atalhos param (Esc fecha, dentro do Modal).
  const onHotkey = useCallback(
    (key: GameHotkey) => {
      if (key === 'help') setOpen('help');
      else if (inside) {
        if (key === 'enter' && station && !completed.has(station.id)) complete(station);
      } else if (targetId) {
        if (key === 'info') setOpen('info');
        else enter(targetId);
      }
    },
    [targetId, inside, station, completed, complete, enter],
  );
  useGameHotkeys(onHotkey, open === null && !fading);

  // Na sala, Esc (sem janela aberta) sai do prédio. O Esc que um Modal já tratou vem marcado com preventDefault.
  useEffect(() => {
    if (!inside) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && open === null) exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inside, open, exit]);
  const close = useCallback(() => setOpen(null), []);
  const clearSelection = useCallback(() => setSelectedId(null), []);

  // Trocar de modo desfaz a seleção: voltando ao Orbital, nada fica selecionado "de antes".
  const changeMode = useCallback((m: NavigationMode) => {
    setMode(m);
    setSelectedId(null);
  }, []);

  // Esc sem janela aberta desfaz a seleção do modo Orbital. Com janela aberta, o Esc é do Modal, que o marca com
  // preventDefault: no navegador, o mesmo Esc ainda chega aqui (na janela) depois de fechar a sala.
  useEffect(() => {
    if (selectedId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // No modo Avatar, as setas andam com o personagem em vez de rolar a página (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
      if (mode === 'avatar' && ARROWS.has(e.key) && !typing && open === null) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, open]);

  const loader = (
    <div className="loader" role="status" data-testid="loader">
      {t('page.loading')}
    </div>
  );

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">{t('nav.back')}</a>
        <a className="btn" href="../../../catalogo/poc-r3f-building-interior-scene/">{t('nav.docs')}</a>
      </nav>

      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        {inside ? <span className="muted">{t('interior.exitHint')}</span> : <NavigationModeToggle mode={mode} onChange={changeMode} />}
        <div className="group" role="group" aria-label={t('page.language')}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" lang={l.id} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <section className="scene" data-testid="scene" data-place={inside ? `interior:${interior?.buildingId}` : 'campus'} data-entry-ms={entryMs ?? ''}>
        <Suspense fallback={loader}>
          {interior ? (
            <InteriorCanvas
              key={interior.buildingId}
              interior={interior}
              labelOf={(key) => t(key)}
              ariaLabel={t('interior.sceneLabel', { building: t(`buildings.${interior.buildingId}`), count: interior.stations.length })}
              completed={completed}
              onNearbyChange={setStationId}
              onMove={onMove}
              onExit={exit}
              onReady={onInteriorReady}
              locked={open !== null || fading}
              highlightedId={stationId}
              touchInput={readJoystick}
            />
          ) : (
          <AvatarCanvas
            key={campusKey}
            campus={campus}
            mode={mode}
            labelOf={(key) => t(key)}
            ariaLabel={t('page.sceneLabel', { count: CAMPUS.buildings.length, mode: t(`mode.${mode}`) })}
            onMove={onMove}
            onNearbyChange={setNearbyId}
            highlightedId={targetId}
            onSelect={mode === 'orbital' && open === null ? setSelectedId : undefined}
            locked={open !== null || fading}
            touchInput={readJoystick}
          />
          )}
        </Suspense>
        <div className={`fade${fading ? ' on' : ''}`} aria-hidden="true" />
        {showJoystick && <TouchJoystick inputRef={joystick} />}
        {inside ? (
          <StationPrompt
            title={station && open === null && !fading ? t(station.titleKey) : null}
            done={!!station && completed.has(station.id)}
            touch={touch}
            onUse={() => station && complete(station)}
          />
        ) : (
          <InteractionPrompt
            buildingLabel={target && open === null && !fading ? t(target.labelKey) : null}
            hint={t(mode === 'orbital' ? 'hud.promptOrbital' : touch ? 'hud.promptTouch' : 'hud.prompt')}
            actions={{
              onEnter: () => target && enter(target.id),
              onInfo: () => setOpen('info'),
              onDismiss: mode === 'orbital' ? clearSelection : undefined,
              onList: target && INTERIORS.has(target.id) ? () => setOpen('room') : undefined,
            }}
          />
        )}
      </section>

      <section className="card info">
        <dl className="pairs">
          <dt>{t('page.position')}</dt>
          <dd data-testid="avatar" data-x={avatar.x} data-z={avatar.z} data-heading={avatar.heading}>
            x {fmt(avatar.x)} · z {fmt(avatar.z)}
          </dd>
          <dt>{t('page.nearby')}</dt>
          <dd data-testid="nearby">{inside ? (station ? t(station.titleKey) : t('page.nobody')) : target ? t(target.labelKey) : t('page.nobody')}</dd>
          <dt>{t('interior.xp')}</dt>
          <dd data-testid="xp" data-xp={xp} data-completed={[...completed].join(',')}>
            {xp} XP
          </dd>
        </dl>
        <div>
          <h2>{t('page.keysTitle')}</h2>
          <ul className="keys">
            <li>{t('page.keysMove')}</li>
            <li>{t('page.keysInteract')}</li>
            <li>{t('page.keysOrbital')}</li>
            <li>{t('page.keysHelp')}</li>
            <li>{t('page.keysTouch')}</li>
            <li>{t('page.keysInterior')}</li>
          </ul>
        </div>
        <label className="notes">
          {t('page.notesLabel')}
          <input type="text" data-testid="notes" placeholder={t('page.notesPlaceholder')} />
        </label>
      </section>

      {open === 'info' && target && <BuildingInfoModal building={target} onClose={close} />}
      {open === 'room' && target && <BuildingRoomPanel building={target} interior={INTERIORS.get(target.id) ?? null} completed={completed} onComplete={complete} onClose={close} />}
      {open === 'help' && <HelpModal onClose={close} />}
    </main>
  );
}
