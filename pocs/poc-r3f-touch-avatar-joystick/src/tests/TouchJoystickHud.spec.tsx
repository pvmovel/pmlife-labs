// Joystick de toque (US29) na página: só no toque, só no modo Avatar e sem janela aberta; a entrada dele chega à
// cena somada à do teclado. A cena 3D é trocada por uma falsa que guarda a função de leitura do joystick.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useEffect, type MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveInput } from '../Domain/Movement';
import { STILL } from '../Domain/TouchJoystick';
import { App } from '../Presentation/App';
import { TouchJoystick } from '../Presentation/HUD/TouchJoystick';
import { I18nProvider } from '../Presentation/i18n/I18n';

type SceneProps = { touchInput?: () => MoveInput; onNearbyChange: (id: string | null) => void };
const scene = vi.hoisted(() => ({ props: null as SceneProps | null }));
vi.mock('../Presentation/Engine3D/AvatarCanvas', () => ({
  default: (props: SceneProps) => {
    useEffect(() => {
      scene.props = props;
    });
    return <div role="img" aria-label="cena" />;
  },
}));

const touchScreen = (coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }));
const renderApp = async () => {
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
  await screen.findByRole('img', { name: 'cena' });
};
const joystick = () => screen.queryByTestId('joystick');

describe('US29: joystick de toque na página', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no toque, abre no Orbital sem joystick; o botão Avatar mostra o joystick', async () => {
    touchScreen(true);
    await renderApp();
    expect(screen.getByRole('button', { name: 'Orbital' })).toHaveAttribute('aria-pressed', 'true');
    expect(joystick()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avatar' }));
    expect(joystick()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Orbital' }));
    expect(joystick()).not.toBeInTheDocument();
  });

  it('Gherkin: com mouse e teclado o joystick não aparece', async () => {
    touchScreen(false);
    await renderApp();
    expect(screen.getByRole('button', { name: 'Avatar' })).toHaveAttribute('aria-pressed', 'true');
    expect(joystick()).not.toBeInTheDocument();
  });

  it('a entrada do joystick chega à cena; com uma janela aberta ele some e a entrada zera', async () => {
    touchScreen(true);
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Avatar' }));
    const el = joystick()!;
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: -50 });
    expect(scene.props?.touchInput?.()).toEqual({ ...STILL, forward: true });

    act(() => scene.props?.onNearbyChange('biblioteca'));
    // No toque, o aviso fala dos botões, não das teclas.
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Toque em Entrar ou Informações');
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(screen.getByRole('dialog', { name: 'Sala: Biblioteca' })).toBeInTheDocument();
    expect(joystick()).not.toBeInTheDocument();
    expect(scene.props?.touchInput?.()).toEqual(STILL);
  });
});

describe('TouchJoystick', () => {
  const mount = () => {
    const inputRef = createRef<MoveInput>() as MutableRefObject<MoveInput>;
    inputRef.current = STILL;
    render(
      <I18nProvider>
        <TouchJoystick inputRef={inputRef} />
      </I18nProvider>,
    );
    // No jsdom a base mede 0×0 em (0, 0): o deslocamento do dedo é o próprio clientX/clientY.
    return { inputRef, el: screen.getByTestId('joystick'), knob: () => (screen.getByTestId('joystick').firstChild as HTMLElement).style.transform };
  };

  it('Gherkin: arrastar para cima anda; para os lados gira; soltar para', () => {
    const { inputRef, el, knob } = mount();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: -40 });
    expect(inputRef.current).toEqual({ ...STILL, forward: true });
    expect(el).toHaveAttribute('data-input', 'forward');
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -40, clientY: 0 });
    expect(inputRef.current).toEqual({ ...STILL, left: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0 });
    expect(inputRef.current).toEqual({ ...STILL, right: true });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(inputRef.current).toEqual(STILL);
    expect(knob()).toBe('translate(0px, 0px)');
  });

  it('o pino não sai da base e um segundo dedo não sequestra o joystick', () => {
    const { inputRef, el, knob } = mount();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: -500 });
    expect(knob()).toBe('translate(0px, -56px)');
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 0, clientY: 50 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 0, clientY: 50 });
    expect(inputRef.current).toEqual({ ...STILL, forward: true });
    fireEvent.pointerUp(el, { pointerId: 2 });
    expect(inputRef.current).toEqual({ ...STILL, forward: true });
    fireEvent.pointerCancel(el, { pointerId: 1 });
    expect(inputRef.current).toEqual(STILL);
  });

  it('o leve toque no centro (zona morta) não move', () => {
    const { inputRef, el } = mount();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: -8 });
    expect(inputRef.current).toEqual(STILL);
    expect(el).toHaveAttribute('data-input', '');
  });
});
