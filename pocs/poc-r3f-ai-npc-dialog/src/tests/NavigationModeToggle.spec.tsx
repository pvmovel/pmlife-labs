// Gherkin "alternância de câmera": o seletor troca Avatar ⇄ Orbital pelo clique e pela tecla C.
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../Presentation/i18n/I18n';
import { initialMode, NavigationModeToggle, type NavigationMode } from '../Presentation/NavigationModeToggle';

function Harness() {
  const [mode, setMode] = useState<NavigationMode>('avatar');
  return (
    <I18nProvider>
      <NavigationModeToggle mode={mode} onChange={setMode} />
      <input aria-label="campo" />
    </I18nProvider>
  );
}

const pressed = () => screen.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent;

describe('NavigationModeToggle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('alterna pelo clique, com aria-pressed correto', () => {
    render(<Harness />);
    expect(pressed()).toBe('Avatar');
    fireEvent.click(screen.getByRole('button', { name: 'Orbital' }));
    expect(pressed()).toBe('Orbital');
  });

  it('tecla C alterna nos dois sentidos; Ctrl+C e digitar num campo não trocam', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'c' });
    expect(pressed()).toBe('Orbital');
    fireEvent.keyDown(window, { key: 'C' });
    expect(pressed()).toBe('Avatar');
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'campo' }), { key: 'c' });
    expect(pressed()).toBe('Avatar');
  });

  it('tela de toque abre no modo Orbital; mouse e teclado abrem no Avatar', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }));
    expect(initialMode()).toBe('orbital');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(initialMode()).toBe('avatar');
  });
});
