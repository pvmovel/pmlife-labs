// Seletor Avatar ⇄ Orbital: botões com aria-pressed (teclado e leitor de tela) e atalho C.
import { useEffect } from 'react';
import { useI18n } from './i18n/I18n';

export type NavigationMode = 'avatar' | 'orbital';

/** Tela de toque abre no modo Orbital: o avatar ainda não anda por toque. */
export function initialMode(): NavigationMode {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches ? 'orbital' : 'avatar';
}

export function NavigationModeToggle({ mode, onChange }: { mode: NavigationMode; onChange: (mode: NavigationMode) => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+C / Cmd+C continuam copiando; digitar num campo não troca o modo.
      if (e.key.toLowerCase() !== 'c' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      onChange(mode === 'avatar' ? 'orbital' : 'avatar');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onChange]);

  return (
    <div className="group" role="group" aria-label={t('mode.label')}>
      {(['avatar', 'orbital'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={m === mode} onClick={() => onChange(m)} aria-keyshortcuts="C">
          {t(`mode.${m}`)}
        </button>
      ))}
    </div>
  );
}
