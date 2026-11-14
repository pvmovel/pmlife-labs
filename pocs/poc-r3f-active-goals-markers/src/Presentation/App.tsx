// A página da PoC (US55): o campus da fase com os marcadores (React.lazy), o painel das metas fixadas, a janela das
// metas (G) pela lista do teclado, o aviso do prédio no alcance (E faz a missão) e as opções (fase, marcadores,
// recomeçar). O progresso da demo fica na memória; as metas fixadas, no aparelho.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { goalHud, markedBuildings, questAt, sanitizePins, togglePin } from '../Domain/Goals';
import type { AvatarState, MoveInput } from '../Domain/Movement';
import { startIsFree } from '../Domain/Movement';
import { toPhaseDocument } from '../Domain/PhaseDocument';
import { STILL } from '../Domain/TouchJoystick';
import phasesData from '../Content/phases.json';
import { useGameHotkeys, type GameHotkey } from './hooks/useGameHotkeys';
import { GoalsHud } from './HUD/GoalsHud';
import { GoalsPanel } from './HUD/GoalsPanel';
import { TouchJoystick } from './HUD/TouchJoystick';
import { useI18n, type Language } from './i18n/I18n';
import { loadMarkersOn, loadPins, saveMarkersOn, savePins } from './pinStore';

const CampusCanvas = lazy(() => import('./Engine3D/CampusCanvas'));

// O documento é conferido ao abrir a página: meta com missão inexistente falha aqui, não no meio da aula.
const DOC = toPhaseDocument(phasesData);
if (!startIsFree(DOC.city)) throw new Error('phases.json: o ponto de partida do avatar está dentro de um prédio ou fora do mapa');

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const isCoarsePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const fmt = (n: number) => n.toFixed(1);

declare global {
  interface Window {
    /** O avatar no último quadro (o e2e usa para virar na direção de um prédio). */
    __avatar?: AvatarState;
  }
}

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phase = DOC.phases[phaseIndex];
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const [pins, setPins] = useState<string[]>(() => sanitizePins(loadPins(phase.id), phase));
  const [markersOn, setMarkersOn] = useState(loadMarkersOn);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [said, setSaid] = useState('');
  const [avatar, setAvatar] = useState<AvatarState>(DOC.city.start);
  const lastHud = useRef(0);
  const [touch] = useState(isCoarsePointer);
  const joystick = useRef<MoveInput>(STILL);
  const readJoystick = useCallback(() => joystick.current, []);

  const hud = useMemo(() => goalHud(phase, pins, completed), [phase, pins, completed]);
  const marked = useMemo(() => (markersOn ? markedBuildings(hud) : []), [hud, markersOn]);
  const nearby = DOC.city.buildings.find((b) => b.id === nearbyId) ?? null;
  const questHere = nearby ? questAt(phase, nearby.id, completed) : null;
  const nameOf = (id: string) => t(DOC.city.buildings.find((b) => b.id === id)?.labelKey ?? id);

  const changePhase = (index: number) => {
    setPhaseIndex(index);
    setPins(sanitizePins(loadPins(DOC.phases[index].id), DOC.phases[index]));
    setSaid('');
  };
  const toggle = useCallback(
    (goalId: string) =>
      setPins((current) => {
        const next = togglePin(current, goalId);
        savePins(phase.id, next);
        return next;
      }),
    [phase.id],
  );
  const doQuest = useCallback(() => {
    if (!nearbyId) return;
    const q = questAt(phase, nearbyId, completed);
    if (!q) {
      setSaid(t('hud.nothingHere'));
      return;
    }
    setCompleted((c) => new Set(c).add(q.id));
    setSaid(t('hud.questDone', { quest: t(q.titleKey), xp: q.rewardXp }));
  }, [nearbyId, phase, completed, t]);

  const onHotkey = useCallback(
    (key: GameHotkey) => {
      if (key === 'goals') setPanelOpen(true);
      else doQuest();
    },
    [doQuest],
  );
  useGameHotkeys(onHotkey, !panelOpen);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  // As setas andam com o avatar em vez de rolar a página (fora de campos de texto e sem janela aberta).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (ARROWS.has(e.key) && !typing && !panelOpen) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const onMove = useCallback((s: AvatarState) => {
    window.__avatar = s; // a cada quadro, sem re-render: o e2e mira o avatar nos prédios
    const now = performance.now();
    if (now - lastHud.current < 100) return;
    lastHud.current = now;
    setAvatar(s);
  }, []);

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">
          {t('nav.back')}
        </a>
        <a className="btn" href="../../../catalogo/poc-r3f-active-goals-markers/">
          {t('nav.docs')}
        </a>
      </nav>
      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        <div className="group" role="group" aria-label={t('page.phase')}>
          {DOC.phases.map((p, i) => (
            <button key={p.id} type="button" aria-pressed={i === phaseIndex} data-phase={p.id} onClick={() => changePhase(i)}>
              {t(p.titleKey)}
            </button>
          ))}
        </div>
        <div className="group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={markersOn}
              data-testid="markers-toggle"
              onChange={(e) => {
                setMarkersOn(e.target.checked);
                saveMarkersOn(e.target.checked);
              }}
            />
            {t('page.markers')}
          </label>
          <button type="button" data-testid="reset" onClick={() => (setCompleted(new Set()), setSaid(''))}>
            {t('page.reset')}
          </button>
          <div className="group" role="group" aria-label={t('page.language')}>
            {LANGUAGES.map((l) => (
              <button key={l.id} type="button" lang={l.id} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="scene" data-testid="scene" data-marked={marked.join(',')}>
        <Suspense fallback={<p className="loader" role="status">{t('page.loading')}</p>}>
          <CampusCanvas
            campus={DOC.city}
            labelOf={t}
            ariaLabel={t('page.sceneLabel', { phase: t(phase.titleKey), count: DOC.city.buildings.length, marked: marked.length ? marked.map(nameOf).join(', ') : t('page.noneMarked') })}
            marked={marked}
            nearbyId={nearbyId}
            onNearbyChange={setNearbyId}
            onMove={onMove}
            locked={panelOpen}
            touchInput={readJoystick}
          />
        </Suspense>
        <GoalsHud hud={hud} buildings={DOC.city.buildings} onOpen={() => setPanelOpen(true)} touch={touch} />
        <div className="prompt-region" aria-live="polite">
          {nearby && !panelOpen && (
            <div className="prompt" data-testid="building-prompt">
              <strong>{t(nearby.labelKey)}</strong>
              <span>{questHere ? t(questHere.titleKey) : t('hud.nothingHere')}</span>
              {questHere && (
                <div className="prompt-actions">
                  <button type="button" onClick={doQuest} aria-keyshortcuts="E">
                    {!touch && <kbd>E</kbd>} {t('hud.doQuest')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {touch && !panelOpen && <TouchJoystick inputRef={joystick} />}
      </section>
      <p className="game-said" role="status" data-testid="game-said">
        {said}
      </p>

      <section className="card info">
        <dl className="pairs">
          <dt>{t('page.nearby')}</dt>
          <dd data-testid="nearby" data-avatar={`${avatar.x},${avatar.z},${avatar.heading}`}>
            {nearby ? t(nearby.labelKey) : t('page.nobody')} · x {fmt(avatar.x)} · z {fmt(avatar.z)}
          </dd>
          <dt>{t('page.completed')}</dt>
          <dd data-testid="completed">{phase.quests.filter((q) => completed.has(q.id)).length} / {phase.quests.length}</dd>
        </dl>
        <h2>{t('page.keysTitle')}</h2>
        <ul className="keys">
          <li>{t('page.keysMove')}</li>
          <li>{t('page.keysGoals')}</li>
          <li>{t('page.keysInteract')}</li>
          <li>{t('page.keysTouch')}</li>
        </ul>
      </section>

      {panelOpen && <GoalsPanel phase={phase} buildings={DOC.city.buildings} completed={completed} pinned={pins} onToggle={toggle} onClose={closePanel} />}
    </main>
  );
}
