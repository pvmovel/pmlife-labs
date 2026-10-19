// Os cenários da US21 (prédios) e da US22b (NPCs) na página inteira. A cena 3D é trocada por uma falsa que põe
// o avatar perto de um prédio ou de um NPC (a proximidade real é testada no domínio e no e2e).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nearby } from '../Presentation/Engine3D/ProximityTrigger';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

// A cena falsa guarda aqui a função que a página passou; o teste a usa para "mover" o avatar.
const scene = vi.hoisted(() => {
  const ref: { onNearbyChange: ((n: Nearby | null) => void) | null } = { onNearbyChange: null };
  return {
    ref,
    setNearby: (id: string | null) => ref.onNearbyChange?.(id ? { kind: 'building', id } : null),
    setNearNpc: (id: string) => ref.onNearbyChange?.({ kind: 'npc', id }),
  };
});
// O mock do servidor: a página usa o caso de uso do Composition Root, com a rede trocada por este fake.
const reply = vi.hoisted(() => vi.fn());
vi.mock('../Presentation/di', async () => {
  const { TalkToNpcUseCase } = await import('../Application/TalkToNpc');
  return { talkToNpc: new TalkToNpcUseCase({ reply }) };
});
vi.mock('../Presentation/Engine3D/AvatarCanvas', () => ({
  default: ({ onNearbyChange }: { onNearbyChange: (n: Nearby | null) => void }) => {
    useEffect(() => {
      scene.ref.onNearbyChange = onNearbyChange;
    }, [onNearbyChange]);
    return <div role="img" aria-label="cena" />;
  },
}));

const renderApp = async () => {
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
  await screen.findByRole('img', { name: 'cena' });
};
const key = (k: string, target: Element | Document | Window = window) => fireEvent.keyDown(target, { key: k });

describe('US21: proximidade, HUD e atalhos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Gherkin: ao entrar no raio, aparece a dica traduzida; ao sair, some', async () => {
    await renderApp();
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
    act(() => scene.setNearby('biblioteca'));
    const prompt = screen.getByTestId('interaction-prompt');
    expect(prompt).toHaveTextContent('Pressione [E] para Entrar ou [I] para Informações');
    expect(prompt).toHaveTextContent('Biblioteca');
    act(() => scene.setNearby(null));
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
  });

  it('I abre as informações e E a sala com as missões do prédio; longe de prédios, nada abre', async () => {
    await renderApp();
    key('i');
    key('e');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => scene.setNearby('biblioteca'));
    key('i');
    expect(screen.getByRole('dialog', { name: 'Sobre: Biblioteca' })).toHaveTextContent('Acervo de leituras');
    key('Escape', document);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    key('E');
    const room = screen.getByRole('dialog', { name: 'Sala: Biblioteca' });
    expect(within(room).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Ler o texto de introdução',
      'Resumir o capítulo 1 em cinco linhas',
    ]);
  });

  it('Gherkin: H abre o "Guia do Aluno & Controles do Campus" no idioma ativo', async () => {
    await renderApp();
    key('h');
    expect(screen.getByRole('dialog', { name: 'Guia do Aluno & Controles do Campus' })).toHaveTextContent('Como andar');
    key('Escape', document);

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    key('h');
    expect(screen.getByRole('dialog', { name: 'Student Guide & Campus Controls' })).toHaveTextContent('How to walk');
  });

  it('Gherkin US22b: perto do NPC, o aviso é de conversa; E abre a conversa e a pergunta vai com a persona dele', async () => {
    reply.mockResolvedValue('Sou a guia do museu.');
    await renderApp();
    act(() => scene.setNearNpc('guia'));
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Guia do MuseuPressione [E] para conversar');
    expect(screen.getByTestId('nearby')).toHaveTextContent('Guia do Museu');
    key('i');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // I é só de prédio
    key('e');
    const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
    expect(screen.getByRole('dialog', { name: 'Conversa: Guia do Museu' })).toBeInTheDocument();
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();

    // Digitar "e", "i" ou "h" no campo da conversa não dispara atalho nenhum.
    for (const k of ['e', 'i', 'h', 'E', 'I', 'H']) key(k, input);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Sou a guia do museu.')).toBeInTheDocument();
    expect(reply).toHaveBeenCalledWith({ persona: 'museum_guide', message: 'Oi', history: [], lang: 'pt-BR' });

    // Fechar e reabrir não apaga a conversa.
    key('Escape', document);
    key('e');
    expect(screen.getAllByTestId('npc-answer')).toHaveLength(1);
  });

  it('Ctrl/Cmd + I, E ou H continuam sendo do navegador', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'h', metaKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('com uma janela aberta, outro atalho não abre uma segunda janela por cima', async () => {
    await renderApp();
    act(() => scene.setNearby('biblioteca'));
    key('h');
    key('i');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
