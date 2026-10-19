import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Turn } from '../Application/TalkToNpc';
import { toCampus } from '../Domain/Campus';
import { startIsFree, type AvatarState } from '../Domain/Movement';
import { toNpcs, withNpcObstacles } from '../Domain/Npc';
import campusData from '../Content/campus.json';
import npcsData from '../Content/npcs.json';
import { talkToNpc } from './di';
import type { Nearby } from './Engine3D/ProximityTrigger';
import { useGameHotkeys, type GameHotkey } from './hooks/useGameHotkeys';
import { BuildingInfoModal } from './HUD/BuildingInfoModal';
import { BuildingRoomPanel } from './HUD/BuildingRoomPanel';
import { HelpModal } from './HUD/HelpModal';
import { InteractionPrompt } from './HUD/InteractionPrompt';
import { NpcDialogModal } from './HUD/NpcDialogModal';
import { useI18n, type Language } from './i18n/I18n';
import { initialMode, NavigationModeToggle, type NavigationMode } from './NavigationModeToggle';

const AvatarCanvas = lazy(() => import('./Engine3D/AvatarCanvas'));

const CAMPUS = toCampus(campusData);
const NPCS = toNpcs(npcsData, CAMPUS);
if (!startIsFree(withNpcObstacles(CAMPUS, NPCS))) throw new Error('campus.json: o ponto de partida do avatar está dentro de um prédio, de um NPC ou fora do mapa');

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const fmt = (n: number) => n.toFixed(1);

type OpenWindow = 'info' | 'room' | 'help' | 'talk' | null;

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<NavigationMode>(initialMode);
  const [avatar, setAvatar] = useState<AvatarState>(CAMPUS.start);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [open, setOpen] = useState<OpenWindow>(null);
  // Conversas por NPC: ficam na página enquanto ela estiver aberta (fechar a janela não apaga).
  const [conversations, setConversations] = useState<Record<string, Turn[]>>({});
  const lastHud = useRef(0);
  const building = nearby?.kind === 'building' ? (CAMPUS.buildings.find((b) => b.id === nearby.id) ?? null) : null;
  const npc = nearby?.kind === 'npc' ? (NPCS.find((n) => n.id === nearby.id) ?? null) : null;
  const nearbyLabel = building ? t(building.labelKey) : npc ? t(npc.labelKey) : null;

  const onMove = useCallback((s: AvatarState) => {
    const now = performance.now();
    if (now - lastHud.current < 100) return;
    lastHud.current = now;
    setAvatar(s);
  }, []);

  // H funciona em qualquer lugar. Perto de um prédio: I informações, E entra. Perto de um NPC: E conversa.
  // Com uma janela aberta, os atalhos param (Esc fecha, dentro do Modal).
  const onHotkey = useCallback(
    (key: GameHotkey) => {
      if (key === 'help') setOpen('help');
      else if (nearby?.kind === 'building') setOpen(key === 'info' ? 'info' : 'room');
      else if (nearby?.kind === 'npc' && key === 'enter') setOpen('talk');
    },
    [nearby],
  );
  useGameHotkeys(onHotkey, open === null);
  const close = useCallback(() => setOpen(null), []);
  const addTurn = useCallback((npcId: string, turn: Turn) => setConversations((c) => ({ ...c, [npcId]: [...(c[npcId] ?? []), turn] })), []);

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
        <a className="btn" href="../../../catalogo/poc-r3f-ai-npc-dialog/">{t('nav.docs')}</a>
      </nav>

      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        <NavigationModeToggle mode={mode} onChange={setMode} />
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
            npcs={NPCS}
            mode={mode}
            labelOf={(key) => t(key)}
            ariaLabel={t('page.sceneLabel', { count: CAMPUS.buildings.length, npcs: NPCS.length, mode: t(`mode.${mode}`) })}
            onMove={onMove}
            onNearbyChange={setNearby}
            nearby={nearby}
            locked={open !== null}
          />
        </Suspense>
        <InteractionPrompt label={open === null ? nearbyLabel : null} hint={npc ? t('hud.promptNpc') : t('hud.prompt')} />
      </section>

      <section className="card info">
        <dl className="pairs">
          <dt>{t('page.position')}</dt>
          <dd data-testid="avatar" data-x={avatar.x} data-z={avatar.z} data-heading={avatar.heading}>
            x {fmt(avatar.x)} · z {fmt(avatar.z)}
          </dd>
          <dt>{t('page.nearby')}</dt>
          <dd data-testid="nearby">{nearbyLabel ?? t('page.nobody')}</dd>
        </dl>
        <div>
          <h2>{t('page.keysTitle')}</h2>
          <ul className="keys">
            <li>{t('page.keysMove')}</li>
            <li>{t('page.keysInteract')}</li>
            <li>{t('page.keysTalk')}</li>
            <li>{t('page.keysHelp')}</li>
          </ul>
        </div>
      </section>

      {open === 'info' && building && <BuildingInfoModal building={building} onClose={close} />}
      {open === 'room' && building && <BuildingRoomPanel building={building} onClose={close} />}
      {open === 'talk' && npc && (
        <NpcDialogModal npc={npc} turns={conversations[npc.id] ?? []} onTurn={(turn) => addTurn(npc.id, turn)} talk={talkToNpc} onClose={close} />
      )}
      {open === 'help' && <HelpModal onClose={close} />}
    </main>
  );
}
