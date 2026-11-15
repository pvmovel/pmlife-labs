// Liga a lista única de atalhos (Domain/Shortcuts) ao teclado: uma tecla, uma ação. Nunca dispara enquanto o aluno
// digita, com Ctrl/Cmd/Alt nem ao segurar a tecla (a regra fica no Domain); com uma janela aberta, fica desligado (a
// janela tem o foco, e o Esc a fecha).
import { useEffect } from 'react';
import { actionFor, type ShortcutMap } from '../../Domain/Shortcuts';

/** O alvo do evento é um lugar onde se digita? */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function useShortcuts(map: ShortcutMap, onAction: (id: string) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const id = actionFor(map, { key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, typing: isTypingTarget(e.target) });
      if (!id) return;
      e.preventDefault();
      onAction(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, onAction, enabled]);
}
