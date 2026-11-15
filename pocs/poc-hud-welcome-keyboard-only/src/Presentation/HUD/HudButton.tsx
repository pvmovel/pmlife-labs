// Todo botão do HUD do modo Avatar nasce daqui: ele lê a tecla da lista única (Domain/Shortcuts), mostra o <kbd> no
// computador e declara o aria-keyshortcuts. O data-hud-action é o que a trava dos testes confere: um botão do HUD
// sem ação com tecla faz o teste falhar.
import type { ReactNode } from 'react';
import { keyLabel, shortcutOf } from '../../Domain/Shortcuts';
import { SHORTCUTS } from '../shortcutMap';

export function HudButton({ action, onClick, touch, children, pressed, className, testId, hideKey }: { action: string; onClick: () => void; touch: boolean; children: ReactNode; pressed?: boolean; className?: string; testId?: string; hideKey?: boolean }) {
  const key = keyLabel(shortcutOf(SHORTCUTS, action));
  return (
    <button type="button" className={className} data-hud-action={action} data-testid={testId} aria-keyshortcuts={key || undefined} aria-pressed={pressed} onClick={onClick}>
      {children}
      {key && !touch && !hideKey && <kbd>{key}</kbd>}
    </button>
  );
}
