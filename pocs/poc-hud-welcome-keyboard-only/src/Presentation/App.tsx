// A página da PoC (US78): a sede de uma instituição de exemplo, com a janela de boas-vindas na primeira visita e o modo
// Avatar 100% pelo teclado. Uma lista única de atalhos (src/Content/shortcuts.json) alimenta o teclado, os botões do
// HUD, a boas-vindas e a ajuda: M troca o modo, C abre o Co-Pilot, T o chat, H a ajuda, I as informações e E entra no
// prédio. O mouse e o toque continuam valendo para tudo.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toCampus } from '../Domain/Campus';
import type { AvatarState, MoveInput } from '../Domain/Movement';
import { startIsFree } from '../Domain/Movement';
import { STILL } from '../Domain/TouchJoystick';
import { shouldShowWelcome } from '../Domain/Welcome';
import campusData from '../Content/campus.json';
import type { NavigationMode } from './Engine3D/CampusCanvas';
import { useShortcuts } from './hooks/useShortcuts';
import { ChatPanel } from './HUD/ChatPanel';
import { CopilotPanel } from './HUD/CopilotPanel';
import { HudButton } from './HUD/HudButton';
import { Modal } from './HUD/Modal';
import { ModeToggle } from './HUD/ModeToggle';
import { ShortcutsGuide } from './HUD/ShortcutsGuide';
import { TouchJoystick } from './HUD/TouchJoystick';
import { useI18n, type Language } from './i18n/I18n';
import { SHORTCUTS } from './shortcutMap';
import { loadSeen, saveSeen } from './welcomeStore';

const CampusCanvas = lazy(() => import('./Engine3D/CampusCanvas'));

const CAMPUS = toCampus(campusData);
if (!startIsFree(CAMPUS)) throw new Error('campus.json: o ponto de partida do avatar está dentro de um prédio ou fora do mapa');

type Window_ = 'welcome' | 'help' | 'info' | 'chat' | 'copilot';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const isCoarsePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

declare global {
  interface Window {
    /** O avatar no último quadro (o e2e usa para virar na direção de um prédio). */
    __avatar?: AvatarState;
  }
}

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState<Window_ | null>(() => (shouldShowWelcome(loadSeen()) ? 'welcome' : null));
  const [mode, setMode] = useState<NavigationMode>('avatar');
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [touch] = useState(isCoarsePointer);
  const joystick = useRef<MoveInput>(STILL);
  const readJoystick = useCallback(() => joystick.current, []);
  const nearby = CAMPUS.buildings.find((b) => b.id === nearbyId) ?? null;

  const toggleMode = useCallback(() => setMode((m) => (m === 'avatar' ? 'orbital' : 'avatar')), []);
  const enter = useCallback(() => {
    if (!nearby || mode !== 'avatar') return;
    setSaid(t('hud.entered', { building: t(nearby.labelKey) }));
  }, [nearby, mode, t]);
  const close = useCallback(() => {
    if (open === 'welcome') saveSeen();
    setOpen(null);
  }, [open]);

  const onAction = useCallback(
    (id: string) => {
      setSaid('');
      if (id === 'mode') toggleMode();
      else if (id === 'interact') enter();
      else if (id === 'help' || id === 'info' || id === 'chat' || id === 'copilot') setOpen(id);
    },
    [toggleMode, enter],
  );
  useShortcuts(SHORTCUTS, onAction, open === null);

  // As setas andam com o avatar em vez de rolar a página (fora de campos de texto e sem janela aberta).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (ARROWS.has(e.key) && !typing && open === null) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onMove = useCallback((s: AvatarState) => {
    window.__avatar = s; // a cada quadro, sem re-render: o e2e mira o avatar nos prédios
  }, []);

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">
          {t('nav.back')}
        </a>
        <a className="btn" href="../../../catalogo/poc-hud-welcome-keyboard-only/">
          {t('nav.docs')}
        </a>
      </nav>
      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        <button type="button" data-testid="reset-welcome" onClick={() => setOpen('welcome')}>
          {t('page.showWelcome')}
        </button>
        <div className="group" role="group" aria-label={t('page.language')}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" lang={l.id} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <section className="scene" data-testid="scene">
        <Suspense fallback={<p className="loader" role="status">{t('page.loading')}</p>}>
          <CampusCanvas
            campus={CAMPUS}
            mode={mode}
            labelOf={t}
            ariaLabel={t(`page.sceneLabel.${mode}`, { count: CAMPUS.buildings.length })}
            nearbyId={nearbyId}
            onNearbyChange={setNearbyId}
            onMove={onMove}
            locked={open !== null}
            touchInput={readJoystick}
          />
        </Suspense>
        <div className="hud" data-testid="hud">
          <div className="hud-bar" role="toolbar" aria-label={t('hud.label')}>
            <HudButton action="info" touch={touch} onClick={() => onAction('info')}>
              {t('hud.info')}
            </HudButton>
            <HudButton action="copilot" touch={touch} onClick={() => onAction('copilot')}>
              {t('hud.copilot')}
            </HudButton>
            <HudButton action="chat" touch={touch} onClick={() => onAction('chat')}>
              {t('hud.chat')}
            </HudButton>
            <HudButton action="help" touch={touch} onClick={() => onAction('help')}>
              {t('hud.help')}
            </HudButton>
          </div>
          <ModeToggle mode={mode} onChange={setMode} touch={touch} />
        </div>
        <div className="prompt-region" aria-live="polite">
          {nearby && mode === 'avatar' && open === null && (
            <div className="prompt" data-testid="building-prompt">
              <strong>{t(nearby.labelKey)}</strong>
              <div className="prompt-actions">
                <HudButton action="interact" touch={touch} onClick={enter}>
                  {t('hud.enter')}
                </HudButton>
              </div>
            </div>
          )}
        </div>
        {touch && mode === 'avatar' && open === null && <TouchJoystick inputRef={joystick} />}
      </section>
      <p className="game-said" role="status" data-testid="game-said">
        {said}
      </p>

      <section className="card info">
        <h2>{t('page.aboutTitle')}</h2>
        <ul className="keys">
          <li>{t('page.about1')}</li>
          <li>{t('page.about2')}</li>
          <li>{t('page.about3')}</li>
        </ul>
        <p className="muted" data-testid="nearby">
          {t('page.nearby')}: {nearby ? t(nearby.labelKey) : t('page.nobody')}
        </p>
      </section>

      {(open === 'welcome' || open === 'help') && <ShortcutsGuide variant={open} touch={touch} onClose={close} />}
      {open === 'chat' && <ChatPanel onClose={close} />}
      {open === 'copilot' && <CopilotPanel onClose={close} />}
      {open === 'info' && (
        <Modal title={t('info.title')} onClose={close} testId="info">
          <p>{nearby ? t(`info.buildings.${nearby.id}`) : t('info.campus')}</p>
        </Modal>
      )}
    </main>
  );
}
