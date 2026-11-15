// Atalho do jogo (E: assistir ao vídeo do totem). Nunca disparam enquanto o aluno digita (input, textarea, select ou editor),
// nem com Ctrl/Cmd/Alt (Ctrl+E, Cmd+I... continuam sendo do navegador), nem ao segurar a tecla.
import { useEffect } from 'react';

export type GameHotkey = 'watch';

const KEYS: Record<string, GameHotkey> = { e: 'watch' };

/** O alvo do evento é um lugar onde se digita? */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function useGameHotkeys(onHotkey: (key: GameHotkey) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const hotkey = KEYS[e.key.toLowerCase()];
      if (!hotkey) return;
      e.preventDefault();
      onHotkey(hotkey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHotkey, enabled]);
}
