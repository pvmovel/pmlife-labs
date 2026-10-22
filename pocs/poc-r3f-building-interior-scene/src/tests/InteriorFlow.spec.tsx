// US32 na página: E (ou Entrar, inclusive no Orbital) entra na sala 3D; E usa a estação e soma o XP; Esc ou a porta
// voltam ao campus diante da porta; a lista de missões continua como alternativa. As duas cenas 3D são trocadas por
// falsas que guardam as funções da página (o 3D de verdade é provado no e2e).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

type CampusProps = { campus: { start: { x: number; z: number; heading: number } }; onNearbyChange: (id: string | null) => void; onSelect?: (id: string) => void };
type InteriorProps = { interior: { buildingId: string }; onNearbyChange: (id: string | null) => void; onExit: () => void; onReady: () => void; completed: ReadonlySet<string> };
const scenes = vi.hoisted(() => ({ campus: null as CampusProps | null, interior: null as InteriorProps | null }));
vi.mock('../Presentation/Engine3D/AvatarCanvas', () => ({
  default: (props: CampusProps) => {
    useEffect(() => {
      scenes.campus = props;
    });
    return <div role="img" aria-label="campus" data-start={`${props.campus.start.x},${props.campus.start.z},${props.campus.start.heading}`} />;
  },
}));
vi.mock('../Presentation/Engine3D/InteriorCanvas', () => ({
  default: (props: InteriorProps) => {
    useEffect(() => {
      scenes.interior = props;
    });
    // A cena real avisa no primeiro quadro desenhado; aqui, ao montar.
    useEffect(() => props.onReady(), []);
    return <div role="img" aria-label={`sala ${props.interior.buildingId}`} />;
  },
}));

const renderApp = async () => {
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
  await screen.findByRole('img', { name: 'campus' });
  await waitFor(() => expect(scenes.campus).not.toBeNull());
};
const key = (k: string) => fireEvent.keyDown(window, { key: k });
const place = () => screen.getByTestId('scene').getAttribute('data-place');
const xp = () => screen.getByTestId('xp').getAttribute('data-xp');
const enterLibrary = async () => {
  act(() => scenes.campus?.onNearbyChange('biblioteca'));
  key('e');
  await screen.findByRole('img', { name: 'sala biblioteca' });
  await waitFor(() => expect(scenes.interior).not.toBeNull());
};

describe('US32: sala 3D do prédio', () => {
  beforeEach(() => {
    scenes.campus = null;
    scenes.interior = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Gherkin: perto da Biblioteca, E abre a cena interna com as estações das missões', async () => {
    await renderApp();
    await enterLibrary();
    expect(place()).toBe('interior:biblioteca');
    expect(Number(screen.getByTestId('scene').getAttribute('data-entry-ms'))).toBeGreaterThanOrEqual(0);
    expect(screen.queryByRole('button', { name: 'Orbital' })).not.toBeInTheDocument(); // na sala, só o avatar
  });

  it('Gherkin: usar a estação (tecla E ou botão Usar) conclui a missão e soma o XP; de novo não soma', async () => {
    await renderApp();
    await enterLibrary();
    act(() => scenes.interior?.onNearbyChange('biblioteca-leitura'));
    expect(screen.getByTestId('station-prompt')).toHaveTextContent('Ler o texto de introdução');
    key('e');
    await waitFor(() => expect(xp()).toBe('300'));
    expect(screen.getByTestId('station-prompt')).toHaveTextContent('✓ Missão concluída');
    key('e');
    expect(xp()).toBe('300');
    act(() => scenes.interior?.onNearbyChange('biblioteca-resumo'));
    fireEvent.click(within(screen.getByTestId('station-prompt')).getByRole('button', { name: 'E Usar' }));
    await waitFor(() => expect(xp()).toBe('800'));
  });

  it('Gherkin: Esc volta ao campus diante da porta da Biblioteca, olhando para fora', async () => {
    await renderApp();
    await enterLibrary();
    key('Escape');
    await screen.findByRole('img', { name: 'campus' });
    expect(place()).toBe('campus');
    expect(screen.getByRole('img', { name: 'campus' })).toHaveAttribute('data-start', '0,3.5,0');
  });

  it('Gherkin: sair pela porta (a cena avisa) também volta ao campus diante da porta', async () => {
    await renderApp();
    await enterLibrary();
    act(() => scenes.interior?.onExit());
    await screen.findByRole('img', { name: 'campus' });
    expect(screen.getByRole('img', { name: 'campus' })).toHaveAttribute('data-start', '0,3.5,0');
  });

  it('Gherkin: no Orbital, Entrar no prédio selecionado também abre a sala', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Orbital' }));
    await waitFor(() => expect(scenes.campus?.onSelect).toBeDefined());
    act(() => scenes.campus?.onSelect?.('laboratorio'));
    fireEvent.click(within(screen.getByTestId('interaction-prompt')).getByRole('button', { name: 'E Entrar' }));
    await screen.findByRole('img', { name: 'sala laboratorio' });
  });

  it('a lista de missões continua como alternativa e conclui as mesmas missões da sala', async () => {
    await renderApp();
    act(() => scenes.campus?.onNearbyChange('biblioteca'));
    fireEvent.click(screen.getByRole('button', { name: 'Lista de missões' }));
    const panel = screen.getByRole('dialog', { name: 'Sala: Biblioteca' });
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Concluir' })[0]);
    expect(xp()).toBe('300');
    expect(within(panel).getByText(/✓ Concluída/)).toBeInTheDocument();
  });

  it('prédio sem sala 3D (Cafeteria): E abre o painel, como antes, e não aparece a lista extra', async () => {
    await renderApp();
    act(() => scenes.campus?.onNearbyChange('cafeteria'));
    expect(screen.queryByRole('button', { name: 'Lista de missões' })).not.toBeInTheDocument();
    key('e');
    expect(screen.getByRole('dialog', { name: 'Sala: Cafeteria' })).toBeInTheDocument();
    expect(place()).toBe('campus');
  });
});
