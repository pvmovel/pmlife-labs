// O editor na tela, com os cenários do Gherkin da US37: a instituição monta o interior de um prédio e publica; a
// configuração inválida não é publicada e aponta o item; a cidade editada por uma instituição não aparece na outra. E o
// teclado na planta, o rascunho, o prédio obrigatório, o curso da plataforma (só ver e copiar), a pré-visualização 3D
// sob demanda e o inglês. O 3D é trocado por um falso (o jsdom não tem WebGL); o de verdade roda no e2e.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n';

vi.mock('../Presentation/Preview3D', () => ({ default: () => <div data-testid="preview-canvas" /> }));

const mount = (language: 'pt-BR' | 'en-US' = 'pt-BR') =>
  render(
    <I18nProvider initial={language}>
      <App />
    </I18nProvider>,
  );
const open = (title: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Documentos da instituição' })).getByRole('button', { name: new RegExp(title) }));
const item = (id: string) => document.querySelector(`[data-item="${id}"]`) as HTMLElement;
const plan = () => screen.getByRole('group', { name: /Planta/ });
const notice = () => screen.getByTestId('notice');

/** Abre o interior da Biblioteca da Fase 1. */
const openLibrary = () => {
  open('Fase 1');
  fireEvent.pointerDown(item('biblioteca'));
  fireEvent.click(screen.getByRole('button', { name: 'Editar o interior' }));
  expect(screen.getByRole('group', { name: /Planta da sala de Biblioteca/ })).toBeInTheDocument();
};

describe('US37: editor da cidade e dos interiores', () => {
  it('Gherkin: a instituição monta o interior de um prédio, publica, e o aluno vê as duas estações', async () => {
    mount();
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar estação' }));
    fireEvent.pointerDown(plan());
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar estação' }));
    expect(within(plan()).getAllByRole('button', { name: /^Estação \d/ })).toHaveLength(2);
    expect(screen.getByText('Nenhum problema: pode publicar.')).toBeInTheDocument();
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Publicado: versão 1. O rascunho tem alterações');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(notice()).toHaveTextContent('Publicado: versão 2. Os alunos já veem esta versão.');
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Publicado: versão 2. Sem rascunho.');
    fireEvent.click(screen.getByRole('button', { name: 'Visão do aluno' }));
    expect(screen.getByText('Visão do aluno: a versão 2 publicada, sem o rascunho.')).toBeInTheDocument();
    expect(within(plan()).getAllByRole('button', { name: /^Estação \d/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('Gherkin: a estação sobre a porta não é publicada; o problema aponta a estação', () => {
    mount();
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar estação' }));
    fireEvent.change(screen.getByLabelText('Posição x (m)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Posição z (m)'), { target: { value: '5' } });
    expect(screen.getByRole('button', { name: 'Estação 1 de Biblioteca: bloqueia a porta.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Problemas (1)' })).toBeInTheDocument();
    expect(item('estacao-1')).toHaveClass('bad');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(notice()).toHaveTextContent('Não publicado: corrija os 1 problema(s) da lista.');
    expect(screen.getByRole('heading', { name: 'Problemas (1)' })).toHaveFocus();
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Publicado: versão 1.');
    // De volta à cidade, o problema continua na lista; clicar nele abre a sala e seleciona a estação.
    fireEvent.click(screen.getByRole('button', { name: 'Cidade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Estação 1 de Biblioteca: bloqueia a porta.' }));
    expect(screen.getByRole('heading', { name: 'Estação 1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Planta da sala de Biblioteca/ })).toBeInTheDocument();
  });

  it('Gherkin: a cidade editada pela Aurora não aparece para outra instituição', () => {
    mount();
    fireEvent.pointerDown(item('matriculas'));
    fireEvent.change(screen.getByLabelText('Posição x (m)'), { target: { value: '-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(notice()).toHaveTextContent('versão 2');
    fireEvent.change(screen.getByLabelText('Instituição (demonstração)'), { target: { value: 'boreal' } });
    expect(item('matriculas')).toHaveAccessibleName(/em x -8 e z -6/);
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Publicado: versão 1.');
    expect(within(screen.getByRole('navigation', { name: 'Documentos da instituição' })).queryByRole('button', { name: /Inglês/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Instituição (demonstração)'), { target: { value: 'aurora' } });
    expect(item('matriculas')).toHaveAccessibleName(/em x -12 e z -6/);
  });

  it('o teclado: Tab chega no prédio, as setas movem na grade e Enter abre o interior; descartar volta à versão publicada', () => {
    mount();
    open('Fase 1');
    const cafe = item('cafe');
    cafe.focus();
    fireEvent.keyDown(cafe, { key: 'ArrowRight' });
    fireEvent.keyDown(cafe, { key: 'ArrowUp', shiftKey: true });
    expect(item('cafe')).toHaveAccessibleName(/Prédio Café da conversa, em x 6.5 e z -6/);
    expect(screen.getByLabelText('Posição x (m)')).toHaveValue(6.5);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    expect(item('cafe')).toHaveAccessibleName(/em x 6 e z -4/);
    expect(notice()).toHaveTextContent('Rascunho descartado');
    fireEvent.keyDown(item('biblioteca'), { key: 'Enter' });
    expect(screen.getByRole('group', { name: /Planta da sala de Biblioteca/ })).toBeInTheDocument();
  });

  it('o prédio obrigatório não sai da cidade (nem pelo botão, nem pelo Delete)', () => {
    mount();
    fireEvent.pointerDown(item('matriculas'));
    expect(screen.getByText('Prédio obrigatório: não pode sair da cidade.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tirar o prédio' })).toBeDisabled();
    fireEvent.keyDown(item('matriculas'), { key: 'Delete' });
    expect(item('matriculas')).toBeInTheDocument();
    expect(notice()).toHaveTextContent('Esse prédio é obrigatório');
  });

  it('o quadro na parede: acrescentar, mudar de parede e ver o problema sobre a porta', () => {
    mount();
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar quadro na parede' }));
    expect(screen.getByRole('heading', { name: 'Quadro na parede' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Parede'), { target: { value: 'south' } });
    fireEvent.change(screen.getByLabelText('Posição na parede (m)'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Quadro de Biblioteca: está sobre a porta.' })).toBeInTheDocument();
  });

  it('o curso da plataforma é só para ver; "Copiar para editar" cria um documento da instituição', () => {
    mount();
    open('Trilha-modelo');
    expect(screen.getByTestId('doc-status')).toHaveTextContent('Curso da plataforma, versão 1: só para ver.');
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    fireEvent.pointerDown(item('mural'));
    expect(screen.getByLabelText('Posição x (m)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar para editar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Trilha-modelo da plataforma (cópia)' })).toBeInTheDocument();
    fireEvent.pointerDown(item('mural'));
    expect(screen.getByLabelText('Posição x (m)')).toBeEnabled();
  });

  it('a pré-visualização 3D abre numa janela, baixada só quando pedida', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar em 3D' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pré-visualização 3D: Sede' });
    expect(await within(dialog).findByTestId('preview-canvas')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('em inglês, os textos e os problemas mudam de idioma', () => {
    mount('en-US');
    expect(screen.getByRole('heading', { level: 1, name: 'Headquarters' })).toBeInTheDocument();
    fireEvent.pointerDown(item('matriculas'));
    fireEvent.change(screen.getByLabelText('Position x (m)'), { target: { value: '30' } });
    expect(screen.getByRole('button', { name: 'Enrollment: goes past the edge of the map.' })).toBeInTheDocument();
  });
});
