// Os cenários do Gherkin na tela: o aluno chega perto do totem e aperta E (ou clica nele, ou toca em Assistir), o vídeo
// abre em tela cheia com só o básico e a cena para; Esc ou Fechar voltam à sala com a cena andando; o aviso de falha
// (erro do player ou rede bloqueada) traz o link do YouTube; o master não grava um link que não é do YouTube nem o
// totem sobre a porta. A cena 3D é trocada por uma falsa que guarda as props.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../Domain/Room';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

type SceneProps = { room: Room; paused: boolean; nearbyId: string | null; onNearbyChange: (id: string | null) => void; onPick: (id: string) => void; ariaLabel: string };
const scene = vi.hoisted(() => ({ props: null as SceneProps | null }));
vi.mock('../Presentation/Engine3D/RoomCanvas', () => ({
  default: (props: SceneProps) => {
    useEffect(() => {
      scene.props = props;
    });
    return <div role="img" aria-label={props.ariaLabel} data-paused={String(props.paused)} />;
  },
}));

const PLAYER = 'https://www.youtube-nocookie.com';
const touchScreen = (coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }));
const renderApp = async (timeoutMs = 10_000) => {
  render(
    <I18nProvider>
      <App timeoutMs={timeoutMs} />
    </I18nProvider>,
  );
  await waitFor(() => expect(scene.props).not.toBeNull());
};
const near = (id: string | null) => act(() => scene.props?.onNearbyChange(id));
const overlay = () => screen.getByTestId('video-overlay');
const iframe = () => overlay().querySelector('iframe') as HTMLIFrameElement;
const fromPlayer = (data: unknown, origin = PLAYER) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data), origin, source: iframe().contentWindow }));
  });

beforeEach(() => {
  scene.props = null;
  touchScreen(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('US38: o totem de vídeo na parede', () => {
  it('Gherkin: perto do totem, E abre o vídeo em tela cheia, só com o básico, e a cena para', async () => {
    await renderApp();
    expect(screen.getByRole('img', { name: /2 totens de vídeo: Listening: um vídeo da aula; Vídeo removido/ })).toBeInTheDocument();
    near('totem-listening');
    expect(screen.getByTestId('totem-prompt')).toHaveTextContent('Listening: um vídeo da aula');
    fireEvent.keyDown(window, { key: 'e' });
    const dialog = screen.getByRole('dialog', { name: 'Vídeo: Listening: um vídeo da aula' });
    expect(within(dialog).getByRole('button', { name: /Fechar/ })).toHaveFocus();
    const src = new URL(iframe().src);
    expect(src.origin).toBe(PLAYER);
    expect(src.pathname).toBe('/embed/aziM2ePu1O8');
    expect(src.searchParams.has('si')).toBe(false);
    expect(iframe()).toHaveAttribute('allowfullscreen');
    expect(scene.props?.paused).toBe(true);
    expect(screen.queryByTestId('totem-prompt')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Carregando o vídeo');
    fromPlayer({ event: 'onReady', id: 1, channel: 'widget' });
    expect(overlay()).toHaveAttribute('data-status', 'ready');
  });

  it('Gherkin: Esc ou Fechar voltam à sala, com a cena andando de novo', async () => {
    await renderApp();
    near('totem-listening');
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('video-overlay')).not.toBeInTheDocument();
    expect(scene.props?.paused).toBe(false);
    expect(screen.getByTestId('totem-prompt')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('totem-prompt')).getByRole('button', { name: /Assistir/ }));
    fireEvent.click(within(overlay()).getByRole('button', { name: /Fechar/ }));
    expect(screen.queryByTestId('video-overlay')).not.toBeInTheDocument();
  });

  it('clicar ou tocar no totem abre o vídeo dele, mesmo longe; longe de tudo, E não abre nada', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.queryByTestId('video-overlay')).not.toBeInTheDocument();
    act(() => scene.props?.onPick('totem-removido'));
    expect(screen.getByRole('dialog', { name: 'Vídeo: Vídeo removido (demonstra o aviso)' })).toBeInTheDocument();
  });

  it('com o vídeo aberto, E não abre outro e o Tab não sai da janela', async () => {
    await renderApp();
    near('totem-listening');
    fireEvent.keyDown(window, { key: 'e' });
    near('totem-removido');
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(new URL(iframe().src).pathname).toBe('/embed/aziM2ePu1O8');
    const close = within(overlay()).getByRole('button', { name: /Fechar/ });
    iframe().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('o erro do player vira o aviso com o link do YouTube; aviso de outra origem é ignorado', async () => {
    await renderApp();
    act(() => scene.props?.onPick('totem-removido'));
    fromPlayer({ event: 'onError', info: 150 }, 'https://evil.example');
    expect(overlay()).toHaveAttribute('data-status', 'loading');
    fromPlayer({ event: 'onError', info: 100 });
    expect(within(overlay()).getByRole('alert')).toHaveTextContent('Este vídeo não está disponível');
    expect(within(overlay()).getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=zzzzzzzzzz0');
  });

  it('sem resposta do player (a rede bloqueia o YouTube), o aviso aparece depois do prazo', async () => {
    await renderApp(30);
    act(() => scene.props?.onPick('totem-listening'));
    expect(await within(overlay()).findByRole('alert')).toHaveTextContent('A rede pode estar bloqueando o YouTube');
    expect(within(overlay()).getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aziM2ePu1O8');
  });

  it('Gherkin: o master cola um link que não é do YouTube, e a configuração é recusada sem gravar nada', async () => {
    await renderApp();
    const link = screen.getByLabelText('Link do YouTube');
    fireEvent.change(link, { target: { value: 'https://vimeo.com/123456' } });
    expect(link).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Ainda não é um link de vídeo do YouTube/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar a sala' }));
    expect(screen.getByTestId('config-result')).toHaveTextContent('Não publicado: o link não é de um vídeo do YouTube (nada foi gravado)');
    expect(scene.props?.room.totems[0].videoId).toBe('aziM2ePu1O8');

    fireEvent.change(link, { target: { value: 'https://youtu.be/dQw4w9WgXcQ?si=compartilhado' } });
    expect(screen.getByText(/ID que será guardado: dQw4w9WgXcQ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar a sala' }));
    expect(screen.getByTestId('config-result')).toHaveTextContent('Publicado: o totem toca o vídeo dQw4w9WgXcQ.');
    expect(scene.props?.room.totems[0].videoId).toBe('dQw4w9WgXcQ');
  });

  it('Gherkin: o totem sobre a porta não é publicado, e o aviso aponta o totem', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('Parede'), { target: { value: 'south' } });
    fireEvent.change(screen.getByLabelText('Posição na parede (m)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar a sala' }));
    expect(screen.getByTestId('config-result')).toHaveTextContent('Não publicado: o totem Listening: um vídeo da aula está sobre a porta');
    expect(scene.props?.room.totems[0].wall).toBe('north');
  });

  it('no toque: o botão Assistir sem a tecla E, e o joystick', async () => {
    touchScreen(true);
    await renderApp();
    expect(document.querySelector('.joystick')).toHaveAttribute('title', 'Joystick: arraste para andar e girar');
    near('totem-listening');
    const watch = within(screen.getByTestId('totem-prompt')).getByRole('button', { name: 'Assistir' });
    fireEvent.click(watch);
    expect(screen.getByTestId('video-overlay')).toBeInTheDocument();
    expect(document.querySelector('.joystick')).toBeNull();
  });

  it('em inglês', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    near('totem-listening');
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByRole('dialog', { name: 'Video: Listening: a lesson video' })).toBeInTheDocument();
    expect(within(overlay()).getByRole('button', { name: /Close/ })).toBeInTheDocument();
  });
});
