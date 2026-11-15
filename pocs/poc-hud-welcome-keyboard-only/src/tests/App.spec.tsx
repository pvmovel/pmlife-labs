// Os cenários do Gherkin da US78 na tela: a boas-vindas na primeira visita (Esc fecha e ela não volta sozinha; H
// reabre a ajuda), T abre o chat com o foco no campo, Esc e C abrem o Co-Pilot com o foco na pergunta, M troca o modo
// e a dica cita o M, e a trava: todo botão do HUD tem tecla e aparece na ajuda. A cena 3D é trocada por uma falsa que
// guarda as props.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keyLabel, missingShortcuts, shortcutOf } from '../Domain/Shortcuts';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';
import { SHORTCUTS } from '../Presentation/shortcutMap';

type SceneProps = { mode: 'avatar' | 'orbital'; onNearbyChange: (id: string | null) => void; locked: boolean; ariaLabel: string };
const scene: { props: SceneProps | null } = { props: null };
vi.mock('../Presentation/Engine3D/CampusCanvas', () => ({
  default: (props: SceneProps) => {
    useEffect(() => {
      scene.props = props;
    });
    return <div role="img" aria-label={props.ariaLabel} />;
  },
}));

const renderApp = async (initial: 'pt-BR' | 'en-US' = 'pt-BR') => {
  const view = render(
    <I18nProvider initial={initial}>
      <App />
    </I18nProvider>,
  );
  await waitFor(() => expect(scene.props).not.toBeNull());
  return view;
};
/** Uma tecla apertada onde o foco está (o atalho escuta na janela; o evento sobe do elemento focado). */
const key = (k: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k });
const esc = () => fireEvent.keyDown(document, { key: 'Escape' });
const near = (id: string | null) => act(() => scene.props?.onNearbyChange(id));
const seen = () => window.localStorage.setItem('pmlife-labs.welcome-seen', '1');

beforeEach(() => {
  scene.props = null;
  window.localStorage.clear();
});

describe('boas-vindas', () => {
  it('Gherkin: na primeira visita, a janela mostra o movimento, as ações, o modo (M) e a tecla H', async () => {
    await renderApp();
    const welcome = screen.getByTestId('welcome');
    expect(within(welcome).getByRole('heading', { name: 'Boas-vindas ao PMLife' })).toBeInTheDocument();
    for (const id of ['move', 'interact', 'mode', 'help']) expect(welcome.querySelector(`[data-shortcut="${id}"]`)).not.toBeNull();
    expect(within(welcome.querySelector('[data-shortcut="mode"]') as HTMLElement).getByText('M')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-start')).toHaveFocus();
    expect(scene.props?.locked).toBe(true);
  });

  it('Gherkin: Esc fecha, ela não abre de novo sozinha e o H reabre a ajuda', async () => {
    const view = await renderApp();
    esc();
    expect(screen.queryByTestId('welcome')).toBeNull();
    expect(scene.props?.locked).toBe(false);
    view.unmount();
    await renderApp();
    expect(screen.queryByTestId('welcome')).toBeNull();
    key('h');
    expect(screen.getByTestId('help')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ajuda: as teclas do campus' })).toBeInTheDocument();
  });

  it('com a janela aberta, as teclas não disparam por trás dela', async () => {
    await renderApp();
    key('m');
    key('t');
    expect(scene.props?.mode).toBe('avatar');
    expect(screen.queryByTestId('chat')).toBeNull();
  });
});

describe('chat e Co-Pilot sem mouse', () => {
  it('Gherkin: T abre o chat com o foco no campo; Esc e C abrem o Co-Pilot com o foco na pergunta', async () => {
    seen();
    await renderApp();
    key('t');
    const input = screen.getByTestId('chat-input');
    expect(input).toHaveFocus();
    expect(input).toHaveValue(''); // o "t" que abriu o chat não vira texto
    esc();
    expect(screen.queryByTestId('chat')).toBeNull();
    key('c');
    expect(screen.getByTestId('copilot-input')).toHaveFocus();
  });

  it('enquanto se digita no chat, t, c, m e h são só texto; Enter envia', async () => {
    seen();
    await renderApp();
    key('t');
    const input = screen.getByTestId('chat-input');
    for (const k of ['t', 'c', 'm', 'h']) key(k);
    expect(screen.queryByTestId('copilot')).toBeNull();
    expect(screen.queryByTestId('help')).toBeNull();
    expect(scene.props?.mode).toBe('avatar');
    fireEvent.change(input, { target: { value: 'Oi, turma!' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('chat-log')).toHaveTextContent('Você: Oi, turma!');
    expect(input).toHaveValue('');
  });

  it('o Co-Pilot responde a pergunta pelo Enter', async () => {
    seen();
    await renderApp();
    key('c');
    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'Como troco o modo?' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('copilot-answer')).toHaveTextContent('Aperte M para alternar');
  });

  it('Ctrl+C e Cmd+T continuam sendo do navegador', async () => {
    seen();
    await renderApp();
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 't', metaKey: true });
    expect(screen.queryByTestId('copilot')).toBeNull();
    expect(screen.queryByTestId('chat')).toBeNull();
  });
});

describe('M troca o modo', () => {
  it('Gherkin: no Avatar, M passa para a visão Orbital e a dica cita "M alterna"', async () => {
    seen();
    await renderApp();
    expect(screen.getByTestId('mode-hint')).toHaveTextContent('M alterna para a visão Orbital');
    key('m');
    expect(scene.props?.mode).toBe('orbital');
    expect(screen.getByTestId('mode-orbital')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-hint')).toHaveTextContent('M alterna para o Avatar');
    key('m');
    expect(scene.props?.mode).toBe('avatar');
  });

  it('o C não troca mais o modo (passou para o Co-Pilot)', async () => {
    seen();
    await renderApp();
    key('c');
    expect(scene.props?.mode).toBe('avatar');
    expect(screen.getByTestId('copilot')).toBeInTheDocument();
  });

  it('o mouse continua valendo: o clique no botão troca o modo', async () => {
    seen();
    await renderApp();
    fireEvent.click(screen.getByTestId('mode-orbital'));
    expect(scene.props?.mode).toBe('orbital');
  });
});

describe('trava: todo botão do HUD tem tecla e aparece na ajuda', () => {
  it('Gherkin "Ação sem tecla barra o PR": nenhuma ação do HUD sem tecla', async () => {
    seen();
    await renderApp();
    near('portal'); // o aviso do prédio (E) também é HUD
    const buttons = [...screen.getByTestId('hud').querySelectorAll('button'), ...screen.getByTestId('building-prompt').querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    const actions = buttons.map((b) => b.getAttribute('data-hud-action') ?? `<botão sem data-hud-action: "${b.textContent}">`);
    const missing = missingShortcuts(SHORTCUTS, actions);
    expect(missing, `ações do HUD sem tecla: ${missing.join(', ')}`).toEqual([]);
    for (const b of buttons) expect(b).toHaveAttribute('aria-keyshortcuts', keyLabel(shortcutOf(SHORTCUTS, b.getAttribute('data-hud-action') ?? '')));

    key('h');
    const help = screen.getByTestId('help');
    for (const id of new Set(actions)) expect(help.querySelector(`[data-shortcut="${id}"]`), `a ajuda não mostra ${id}`).not.toBeNull();
  });
});

describe('perto de um prédio', () => {
  it('E entra no prédio, I mostra as informações dele', async () => {
    seen();
    await renderApp();
    near('secretaria');
    key('e');
    expect(screen.getByTestId('game-said')).toHaveTextContent('Você entrou em Secretaria do aluno');
    key('i');
    expect(screen.getByTestId('info')).toHaveTextContent('Secretaria do aluno: o progresso');
  });

  it('em inglês, a dica e a ajuda trocam de idioma', async () => {
    seen();
    await renderApp('en-US');
    expect(screen.getByTestId('mode-hint')).toHaveTextContent('M switches to the Orbital view');
    key('h');
    expect(screen.getByRole('heading', { name: 'Help: the campus keys' })).toBeInTheDocument();
  });
});
