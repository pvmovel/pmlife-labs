import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toCampus } from '../Domain/Campus';
import { startIsFree, type AvatarState } from '../Domain/Movement';
import campusData from '../Content/campus.json';
import { useGameHotkeys, type GameHotkey } from './hooks/useGameHotkeys';
import { BuildingInfoModal } from './HUD/BuildingInfoModal';
import { BuildingRoomPanel } from './HUD/BuildingRoomPanel';
import { HelpModal } from './HUD/HelpModal';
import { InteractionPrompt } from './HUD/InteractionPrompt';
import { useI18n, type Language } from './i18n/I18n';
import { initialMode, NavigationModeToggle, type NavigationMode } from './NavigationModeToggle';

const AvatarCanvas = lazy(() => import('./Engine3D/AvatarCanvas'));

const CAMPUS = toCampus(campusData);
if (!startIsFree(CAMPUS)) throw new Error('campus.json: o ponto de partida do avatar está dentro de um prédio ou fora do mapa');

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const fmt = (n: number) => n.toFixed(1);

type OpenWindow = 'info' | 'room' | 'help' | null;

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<NavigationMode>(initialMode);
  const [avatar, setAvatar] = useState<AvatarState>(CAMPUS.start);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenWindow>(null);
  const lastHud = useRef(0);
  // O alvo das teclas e dos botões: no modo Avatar, o prédio no alcance; no Orbital, o que o aluno clicou ou tocou.
  const targetId = mode === 'orbital' ? selectedId : nearbyId;
  const target = CAMPUS.buildings.find((b) => b.id === targetId) ?? null;

  const onMove = useCallback((s: AvatarState) => {
    const now = performance.now();
    if (now - lastHud.current < 100) return;
    lastHud.current = now;
    setAvatar(s);
  }, []);

  // H funciona em qualquer lugar; I e E só com um prédio no alcance (Avatar) ou selecionado (Orbital). Com uma
  // janela aberta, os atalhos param (Esc fecha, dentro do Modal).
  const onHotkey = useCallback(
    (key: GameHotkey) => {
      if (key === 'help') setOpen('help');
      else if (targetId) setOpen(key === 'info' ? 'info' : 'room');
    },
    [targetId],
  );
  useGameHotkeys(onHotkey, open === null);
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
        <a className="btn" href="../../../catalogo/poc-r3f-orbital-building-picking/">{t('nav.docs')}</a>
      </nav>

      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        <NavigationModeToggle mode={mode} onChange={changeMode} />
        <div className="group" role="group" aria-label={t('page.language')}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" lang={l.id} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <section className="scene">
        <Suspense fallback={loader}>
          <AvatarCanvas
            campus={CAMPUS}
            mode={mode}
            labelOf={(key) => t(key)}
            ariaLabel={t('page.sceneLabel', { count: CAMPUS.buildings.length, mode: t(`mode.${mode}`) })}
            onMove={onMove}
            onNearbyChange={setNearbyId}
            highlightedId={targetId}
            onSelect={mode === 'orbital' && open === null ? setSelectedId : undefined}
            locked={open !== null}
          />
        </Suspense>
        <InteractionPrompt
          buildingLabel={target && open === null ? t(target.labelKey) : null}
          hint={t(mode === 'orbital' ? 'hud.promptOrbital' : 'hud.prompt')}
          actions={{ onEnter: () => setOpen('room'), onInfo: () => setOpen('info'), onDismiss: mode === 'orbital' ? clearSelection : undefined }}
        />
      </section>

      <section className="card info">
        <dl className="pairs">
          <dt>{t('page.position')}</dt>
          <dd data-testid="avatar" data-x={avatar.x} data-z={avatar.z} data-heading={avatar.heading}>
            x {fmt(avatar.x)} · z {fmt(avatar.z)}
          </dd>
          <dt>{t('page.nearby')}</dt>
          <dd data-testid="nearby">{target ? t(target.labelKey) : t('page.nobody')}</dd>
        </dl>
        <div>
          <h2>{t('page.keysTitle')}</h2>
          <ul className="keys">
            <li>{t('page.keysMove')}</li>
            <li>{t('page.keysInteract')}</li>
            <li>{t('page.keysOrbital')}</li>
            <li>{t('page.keysHelp')}</li>
          </ul>
        </div>
        <label className="notes">
          {t('page.notesLabel')}
          <input type="text" data-testid="notes" placeholder={t('page.notesPlaceholder')} />
        </label>
      </section>

      {open === 'info' && target && <BuildingInfoModal building={target} onClose={close} />}
      {open === 'room' && target && <BuildingRoomPanel building={target} onClose={close} />}
      {open === 'help' && <HelpModal onClose={close} />}
    </main>
  );
}
