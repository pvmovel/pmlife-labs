// Os três cenários do Gherkin da US21 na página inteira. A cena 3D é trocada por uma falsa que põe o avatar
// perto da Biblioteca (a proximidade real é testada no domínio e no e2e).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

// A cena falsa guarda aqui a função que a página passou; o teste a usa para "mover" o avatar.
// A cena falsa guarda as funções que a página passou: "mover" o avatar (proximidade) e "clicar" num prédio
// (seleção do modo Orbital). Ela também mostra qual prédio a página mandou destacar.
type SceneProps = { onNearbyChange: (id: string | null) => void; onSelect?: (id: string) => void; highlightedId: string | null };
const scene = vi.hoisted(() => {
  const ref: { props: SceneProps | null } = { props: null };
  return {
    ref,
    setNearby: (id: string | null) => ref.props?.onNearbyChange(id),
    /** Clique num prédio; devolve false se a página não deixou o prédio clicável (fora do Orbital). */
    click: (id: string) => (ref.props?.onSelect ? (ref.props.onSelect(id), true) : false),
  };
});
vi.mock('../Presentation/Engine3D/AvatarCanvas', () => ({
  default: (props: SceneProps) => {
    useEffect(() => {
      scene.ref.props = props;
    });
    return <div role="img" aria-label="cena" data-highlighted={props.highlightedId ?? ''} />;
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

    // US32: a Cafeteria não tem sala 3D: E abre o painel com as missões (a Biblioteca entra na sala; ver Interior.spec).
    act(() => scene.setNearby('cafeteria'));
    key('E');
    const room = screen.getByRole('dialog', { name: 'Sala: Cafeteria' });
    expect(within(room).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Apresentar-se no fórum da turma']);
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

  it('Gherkin: digitar "e", "i" ou "h" num campo de texto não abre nada', async () => {
    await renderApp();
    act(() => scene.setNearby('biblioteca'));
    const notes = screen.getByTestId('notes');
    for (const k of ['e', 'i', 'h', 'E', 'I', 'H']) key(k, notes);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

describe('US27: interação no modo Orbital', () => {
  const orbital = () => fireEvent.click(screen.getByRole('button', { name: 'Orbital' }));

  it('Gherkin: clicar num prédio o destaca e mostra Entrar e Informações; Entrar abre a sala', async () => {
    await renderApp();
    expect(scene.click('biblioteca')).toBe(false); // no modo Avatar, os prédios não são clicáveis
    orbital();
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
    act(() => void scene.click('biblioteca'));
    const prompt = screen.getByTestId('interaction-prompt');
    expect(prompt).toHaveTextContent('Biblioteca');
    expect(screen.getByRole('img', { name: 'cena' })).toHaveAttribute('data-highlighted', 'biblioteca');
    act(() => void scene.click('cafeteria')); // US32: sem sala 3D, Entrar abre o painel
    fireEvent.click(within(screen.getByTestId('interaction-prompt')).getByRole('button', { name: 'E Entrar' }));
    expect(screen.getByRole('dialog', { name: 'Sala: Cafeteria' })).toBeInTheDocument();
  });

  it('Gherkin: Informações (botão ou tecla I) abre a janela "Sobre"; E também entra', async () => {
    await renderApp();
    orbital();
    act(() => void scene.click('auditorio'));
    fireEvent.click(screen.getByRole('button', { name: 'I Informações' }));
    expect(screen.getByRole('dialog', { name: 'Sobre: Auditório' })).toBeInTheDocument();
    // Como no navegador: o Esc que o Modal trata (no document) sobe até a janela.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Auditório'); // a seleção continua
    key('i');
    expect(screen.getByRole('dialog', { name: 'Sobre: Auditório' })).toBeInTheDocument();
    key('Escape', document);
    key('e');
    expect(screen.getByRole('dialog', { name: 'Sala: Auditório' })).toBeInTheDocument();
  });

  it('com uma janela aberta, clicar em outro prédio não troca a seleção por trás dela', async () => {
    await renderApp();
    orbital();
    act(() => void scene.click('auditorio'));
    key('i');
    expect(scene.click('cafeteria')).toBe(false);
  });

  it('clicar em outro prédio troca a seleção; × ou Esc desfaz', async () => {
    await renderApp();
    orbital();
    act(() => void scene.click('biblioteca'));
    act(() => void scene.click('cafeteria'));
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Cafeteria');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a seleção' }));
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
    act(() => void scene.click('laboratorio'));
    key('Escape');
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no Orbital, o alcance do avatar não gera aviso; trocar de modo desfaz a seleção', async () => {
    await renderApp();
    act(() => scene.setNearby('biblioteca'));
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Pressione [E] para Entrar ou [I] para Informações');
    orbital();
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
    act(() => void scene.click('cafeteria'));
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Escolha uma ação ou use as teclas E e I');
    fireEvent.click(screen.getByRole('button', { name: 'Avatar' }));
    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent('Biblioteca'); // de volta ao alcance do avatar
    orbital();
    expect(screen.queryByTestId('interaction-prompt')).not.toBeInTheDocument();
  });

  it('no modo Avatar os botões do aviso também funcionam (mouse e toque)', async () => {
    await renderApp();
    act(() => scene.setNearby('auditorio'));
    expect(screen.queryByRole('button', { name: 'Desfazer a seleção' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'E Entrar' }));
    expect(screen.getByRole('dialog', { name: 'Sala: Auditório' })).toBeInTheDocument();
  });

  it('em inglês, as ações vêm traduzidas', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    orbital();
    act(() => void scene.click('biblioteca'));
    expect(screen.getByRole('button', { name: 'E Enter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I Information' })).toBeInTheDocument();
  });
});
