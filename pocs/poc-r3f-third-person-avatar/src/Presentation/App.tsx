import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toCampus } from '../Domain/Campus';
import { startIsFree, type AvatarState } from '../Domain/Movement';
import campusData from '../Content/campus.json';
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
const degrees = (rad: number) => Math.round((((rad * 180) / Math.PI) % 360 + 360) % 360);

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<NavigationMode>(initialMode);
  const [avatar, setAvatar] = useState<AvatarState>(CAMPUS.start);
  const lastHud = useRef(0);

  // O painel acompanha o avatar ~10 vezes por segundo (o 3D anda a cada quadro sem re-render do React).
  const onMove = useCallback((s: AvatarState) => {
    const now = performance.now();
    if (now - lastHud.current < 100) return;
    lastHud.current = now;
    setAvatar(s);
  }, []);

  // No modo Avatar, as setas andam com o personagem em vez de rolar a página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode === 'avatar' && ARROWS.has(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const loader = (
    <div className="loader" role="status" data-testid="loader">
      {t('page.loading')}
    </div>
  );

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">{t('nav.back')}</a>
        <a className="btn" href="../../../catalogo/poc-r3f-third-person-avatar/">{t('nav.docs')}</a>
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
            mode={mode}
            labelOf={(key) => t(key)}
            ariaLabel={t('page.sceneLabel', { count: CAMPUS.buildings.length, mode: t(`mode.${mode}`) })}
            onMove={onMove}
          />
        </Suspense>
      </section>

      <section className="card info">
        <dl className="pairs">
          <dt>{t('page.position')}</dt>
          <dd data-testid="avatar" data-x={avatar.x} data-z={avatar.z} data-heading={avatar.heading}>
            x {fmt(avatar.x)} · z {fmt(avatar.z)}
          </dd>
          <dt>{t('page.heading')}</dt>
          <dd>{degrees(avatar.heading)}°</dd>
        </dl>
        <div>
          <h2>{t('page.keysTitle')}</h2>
          <ul className="keys">
            <li>{t('page.keysMove')}</li>
            <li>{t('page.keysTurn')}</li>
            <li>{t('page.keysMode')}</li>
            <li>{t('page.keysOrbital')}</li>
          </ul>
          {initialMode() === 'orbital' && <p className="muted">{t('page.touchNote')}</p>}
        </div>
      </section>
    </main>
  );
}
