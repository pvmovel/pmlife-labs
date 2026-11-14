// Os cenários do Gherkin na tela: o aluno abre as metas (G), fixa pela lista do teclado (a tecla do item), o HUD mostra
// "0 de 2" e os prédios marcados; perto do prédio, E faz a missão, e a meta cumprida tira os marcadores; na fase sem
// metas, o HUD sugere a próxima missão. A cena 3D é trocada por uma falsa que guarda as props.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

type SceneProps = { marked: readonly string[]; onNearbyChange: (id: string | null) => void; locked: boolean; ariaLabel: string };
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
const near = (id: string | null) => act(() => scene.props?.onNearbyChange(id));
const key = (k: string, code = '') => fireEvent.keyDown(window, { key: k, code });
const hud = () => screen.getByTestId('goals-hud');
const openPanel = () => {
  key('g', 'KeyG');
  return screen.getByTestId('goals-panel');
};
/** Escolhe o item pela tecla dele, com o foco na lista (como o aluno). */
const pickSlot = (panel: HTMLElement, digit: string) => fireEvent.keyDown(within(panel).getByRole('listbox'), { key: digit, code: `Digit${digit}` });

beforeEach(() => {
  scene.props = null;
  window.localStorage.clear();
});

describe('objetivos ativos na tela', () => {
  it('Gherkin: fixar "Base técnica" marca os dois prédios e o HUD mostra 0 de 2', async () => {
    await renderApp();
    expect(scene.props?.marked).toEqual([]);
    const panel = openPanel();
    expect(within(panel).getByRole('listbox')).toHaveFocus();
    expect(scene.props?.locked).toBe(true);
    pickSlot(panel, '1');
    expect(screen.getByTestId('pin-said')).toHaveTextContent('Base técnica fixada.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('goals-panel')).toBeNull();
    expect(screen.getByTestId('progress-base-tecnica')).toHaveTextContent('0 de 2');
    expect(scene.props?.marked).toEqual(['oficina', 'dados']);
    expect(within(hud()).getByText(/Oficina de código, Laboratório de dados/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/Prédios marcados: Oficina de código, Laboratório de dados/);
  });

  it('Gherkin: concluir as duas missões cumpre a meta, e os marcadores somem', async () => {
    await renderApp();
    pickSlot(openPanel(), '1');
    fireEvent.keyDown(document, { key: 'Escape' });
    near('oficina');
    expect(screen.getByTestId('building-prompt')).toHaveTextContent('Escrever os primeiros testes');
    key('e', 'KeyE');
    expect(screen.getByTestId('game-said')).toHaveTextContent('Missão concluída: Escrever os primeiros testes (+100 XP).');
    expect(screen.getByTestId('progress-base-tecnica')).toHaveTextContent('1 de 2');
    expect(scene.props?.marked).toEqual(['dados']);
    near('dados');
    fireEvent.click(within(screen.getByTestId('building-prompt')).getByRole('button'));
    expect(screen.getByTestId('progress-base-tecnica')).toHaveTextContent('cumprida');
    expect(hud().querySelector('[data-goal="base-tecnica"]')).toHaveAttribute('data-status', 'concluded');
    expect(scene.props?.marked).toEqual([]);
  });

  it('Gherkin: na fase sem metas do autor, o HUD sugere a próxima missão aberta', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Fase 2/ }));
    expect(screen.getByTestId('suggestion')).toHaveTextContent('Refinar as histórias da sprint, na Sala de produto');
    expect(scene.props?.marked).toEqual(['produto']);
    const panel = openPanel();
    expect(within(panel).queryByRole('listbox')).toBeNull();
    expect(panel).toHaveTextContent('Esta fase não tem metas do autor');
  });

  it('desafixar pela mesma tecla, e a meta fixada continua fixada depois de recarregar', async () => {
    const first = await renderApp();
    let panel = openPanel();
    pickSlot(panel, '2');
    pickSlot(panel, '3');
    pickSlot(panel, '2');
    expect(screen.getByTestId('pin-said')).toHaveTextContent('Visão de produto desafixada.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hud().querySelectorAll('[data-goal]')).toHaveLength(1);
    expect(hud().querySelector('[data-goal="plano"]')).not.toBeNull();
    first.unmount();
    scene.props = null;
    await renderApp();
    expect(hud().querySelector('[data-goal="plano"]')).not.toBeNull();
    panel = openPanel();
    expect(within(panel).getByText(/Plano do trimestre · fixada/)).toBeInTheDocument();
  });

  it('os marcadores podem ser desligados nas opções, sem perder as metas', async () => {
    await renderApp();
    pickSlot(openPanel(), '1');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('markers-toggle'));
    expect(scene.props?.marked).toEqual([]);
    expect(screen.getByTestId('progress-base-tecnica')).toHaveTextContent('0 de 2');
    fireEvent.click(screen.getByTestId('markers-toggle'));
    expect(scene.props?.marked).toEqual(['oficina', 'dados']);
  });

  it('com a janela aberta, E não faz missão; perto de um prédio sem missão, o aviso diz que não há nada', async () => {
    await renderApp();
    near('oficina');
    openPanel();
    key('e', 'KeyE');
    expect(screen.getByTestId('completed')).toHaveTextContent('0 / 5');
    fireEvent.keyDown(document, { key: 'Escape' });
    key('e', 'KeyE');
    expect(screen.getByTestId('completed')).toHaveTextContent('1 / 5');
    expect(screen.getByTestId('building-prompt')).toHaveTextContent('Nada a fazer aqui');
  });

  it('em inglês, os mesmos textos', async () => {
    await renderApp('en-US');
    pickSlot(openPanel(), '1');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('progress-base-tecnica')).toHaveTextContent('0 of 2');
    expect(hud()).toHaveTextContent('Technical foundation');
  });
});
