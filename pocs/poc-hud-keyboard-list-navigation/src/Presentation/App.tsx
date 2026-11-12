// A demo (US52): uma praça com o avatar e três prédios. Perto de um prédio, E (ou o toque no prédio) abre a janela dele,
// e a escolha é 100% pelo teclado. Com a janela aberta, o avatar não anda, nem com as setas que trocam a página.
import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarStep, MOVE_CODES, nearest, PLAZA, type Point } from '../Domain/Plaza';
import { EnrollmentModal } from './HUD/EnrollmentModal';
import { PortalModal } from './HUD/PortalModal';
import { useI18n } from './i18n/I18n';
import { WORLD, type World } from './world';

type Open = 'courses-portal' | 'phases-portal' | 'enrollment' | null;

/** O alvo do evento é um lugar onde se digita? (a mesma regra do campus do produto) */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

const frame = (cb: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number));
const cancelFrame = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

export function App({ world = WORLD }: { world?: World }) {
  const { t, language, setLanguage } = useI18n();
  const [avatar, setAvatar] = useState<Point>(world.start);
  const [open, setOpen] = useState<Open>(null);
  const [place, setPlace] = useState<string | null>(null);
  const pressed = useRef(new Set<string>());
  const openRef = useRef<Open>(null);
  openRef.current = open;
  const near = nearest(avatar, world.buildings);
  const nearRef = useRef(near);
  nearRef.current = near;

  // As teclas apertadas (pelo `code`, como o KeyboardControls do produto), soltas ao perder o foco da janela.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) pressed.current.add(e.code);
      if (e.code === 'KeyE' && !e.repeat && openRef.current === null && !isTypingTarget(e.target) && nearRef.current) {
        e.preventDefault();
        setOpen(nearRef.current.id as Open);
      }
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const clear = () => pressed.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // O laço do avatar: anda pelas teclas, a menos que haja uma janela aberta ou o aluno esteja digitando.
  useEffect(() => {
    let last = performance.now();
    let id = 0;
    const tick = () => {
      const now = performance.now();
      // O intervalo é fixado aqui: o React pode rodar o atualizador depois, quando `last` já mudou.
      const seconds = (now - last) / 1000;
      const blocked = openRef.current !== null || isTypingTarget(document.activeElement);
      setAvatar((at) => avatarStep(at, pressed.current, seconds, blocked));
      last = now;
      id = frame(tick);
    };
    id = frame(tick);
    return () => cancelFrame(id);
  }, []);

  const close = useCallback(() => setOpen(null), []);
  const pct = (p: Point) => ({ left: `${(p.x / PLAZA.width) * 100}%`, top: `${(p.y / PLAZA.height) * 100}%` });

  return (
    <main className="page">
      <header className="top">
        <h1>{t('page.title')}</h1>
        <button type="button" className="ghost" onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}>
          {t('page.language')}
        </button>
      </header>
      <p className="muted">{t('page.lead')}</p>
      <p className="place" role="status" data-testid="place">
        {t('page.place', { place: place ?? t('page.plaza') })}
      </p>
      <div className="plaza" aria-label={world.school[language]}>
        {world.buildings.map((b) => (
          <button key={b.id} type="button" className={`building${near?.id === b.id ? ' near' : ''}`} style={pct(b.at)} data-building={b.id} onClick={() => setOpen(b.id as Open)}>
            {t(`buildings.${b.id}`)}
          </button>
        ))}
        <div className="avatar" data-testid="avatar" data-x={avatar.x.toFixed(2)} data-y={avatar.y.toFixed(2)} style={pct(avatar)} aria-hidden="true" />
      </div>
      <p className="prompt" aria-live="polite">
        {near && open === null ? t('prompt.enter', { building: t(`buildings.${near.id}`) }) : ''}
      </p>
      {(open === 'courses-portal' || open === 'phases-portal') && <PortalModal kind={open} world={world} onGo={setPlace} onClose={close} />}
      {open === 'enrollment' && <EnrollmentModal world={world} onClose={close} />}
    </main>
  );
}
