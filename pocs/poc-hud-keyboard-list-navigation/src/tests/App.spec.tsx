// A demo na tela, com os cenários do Gherkin da US52. O avatar começa ao lado do prédio de cada teste (o mundo é o
// mesmo, só muda o ponto de partida), e as teclas são eventos de teclado de verdade sobre o elemento com o foco.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider, type Language } from '../Presentation/i18n/I18n';
import { WORLD, type World } from '../Presentation/world';

const near = (id: string): World => {
  const b = WORLD.buildings.find((x) => x.id === id)!;
  return { ...WORLD, start: { x: b.at.x, y: b.at.y + 1.5 } };
};

function setup(building: string, language: Language = 'pt-BR', world = near(building)) {
  render(
    <I18nProvider initial={language}>
      <App world={world} />
    </I18nProvider>,
  );
  fireEvent.keyDown(window, { key: 'e', code: 'KeyE' });
  const list = screen.getByRole('listbox');
  return { list, key: (code: string, key = code) => fireEvent.keyDown(document.activeElement ?? list, { code, key }) };
}

const place = () => screen.getByTestId('place').textContent;
const activeTitle = (list: HTMLElement) => within(list).getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent;

describe('Portal das fases pelo teclado (US52)', () => {
  it('a janela abre com o foco na lista, não no Fechar, e o destaque na fase em andamento', () => {
    const { list } = setup('phases-portal');
    expect(document.activeElement).toBe(list);
    expect(activeTitle(list)).toContain('Fase 4 · Casa');
    expect(within(list).getAllByRole('option')).toHaveLength(10);
    expect(screen.getByTestId('page')).toHaveTextContent('Página 1 de 3');
  });

  it('Gherkin "Entrar numa fase pelo número": a tecla 3 vai para a 3ª fase da página, sem mouse', () => {
    const { key } = setup('phases-portal');
    key('Digit3', '3');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(place()).toContain('Fase 3 · Família');
  });

  it('Gherkin "Enter na fase em andamento"', () => {
    const { key } = setup('phases-portal');
    key('Enter');
    expect(place()).toContain('Fase 4 · Casa');
  });

  it('Gherkin "Fase bloqueada não abre pelo número": fica no portal, destacada, e o motivo é lido', () => {
    const { list, key } = setup('phases-portal');
    key('Digit6', '6');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(activeTitle(list)).toContain('Fase 6 · Rotina');
    expect(screen.getByTestId('said')).toHaveTextContent('Fase 6 · Rotina está bloqueada: conclua a Fase 5 · Comida');
  });

  it('Gherkin "Paginação com 30 fases": → duas vezes mostra 21 a 30, e o 0 leva à 30ª', () => {
    const { list, key } = setup('phases-portal');
    key('ArrowRight');
    key('ArrowRight');
    expect(screen.getByTestId('page')).toHaveTextContent('Página 3 de 3');
    const titles = within(list).getAllByRole('option').map((o) => o.textContent);
    expect(titles[0]).toContain('Fase 21');
    expect(titles[9]).toContain('Fase 30');
    key('Digit0', '0');
    expect(place()).toContain('Fase 30 · Revisão final');
  });

  it('o teclado numérico vale; ↑/↓ atravessam a página; Home e End; Enter entra no destacado', () => {
    const { list, key } = setup('phases-portal');
    key('End');
    expect(activeTitle(list)).toContain('Fase 30');
    key('Home');
    expect(activeTitle(list)).toContain('Fase 1 ');
    for (let i = 0; i < 10; i++) key('ArrowDown');
    expect(screen.getByTestId('page')).toHaveTextContent('Página 2 de 3');
    expect(activeTitle(list)).toContain('Fase 11');
    key('Numpad2', '2');
    expect(place()).toContain('Fase 12');
  });

  it('cada item mostra a tecla dele (aria-keyshortcuts) e o mouse continua valendo', () => {
    const { list } = setup('phases-portal');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    fireEvent.click(options[4]);
    expect(place()).toContain('Fase 5');
  });

  it('Esc fecha a janela', () => {
    const { key } = setup('phases-portal');
    key('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('em inglês', () => {
    const { key } = setup('phases-portal', 'en-US');
    expect(screen.getByTestId('page')).toHaveTextContent('Page 1 of 3');
    key('Digit7', '7');
    expect(screen.getByTestId('said')).toHaveTextContent('Phase 7 · City is locked: complete Phase 5 · Food');
  });
});

describe('Portal dos cursos (US52)', () => {
  it('12 cursos em 2 páginas; → e a tecla 2 vão ao 12º curso', () => {
    const { key } = setup('courses-portal');
    expect(screen.getByTestId('page')).toHaveTextContent('Página 1 de 2');
    key('PageDown');
    key('Digit2', '2');
    expect(place()).toContain('Inglês para negócios');
  });
});

describe('Matrículas pelo teclado (US52)', () => {
  it('o número no curso livre matricula; no com aprovação, pede', () => {
    const { key } = setup('enrollment');
    key('Digit2', '2');
    expect(screen.getByTestId('enroll-message')).toHaveTextContent('Matrícula em Conversação feita.');
    key('Digit4', '4');
    expect(screen.getByTestId('enroll-message')).toHaveTextContent('Pedido de matrícula em Inglês para negócios enviado.');
  });

  it('Gherkin "Curso por código leva ao campo do código", e digitar o código não escolhe curso', () => {
    const { list, key } = setup('enrollment');
    key('Digit3', '3');
    const input = screen.getByLabelText('Código de convite de Pronúncia');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { code: 'Digit2', key: '2' });
    fireEvent.change(input, { target: { value: 'aurora-2026' } });
    expect(screen.getByTestId('enroll-message')).toHaveTextContent('');
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByTestId('enroll-message')).toHaveTextContent('Matrícula em Pronúncia feita.');
    expect(document.activeElement).toBe(list);
  });

  it('código errado avisa; Esc no campo volta à lista sem fechar a janela', () => {
    const { list, key } = setup('enrollment');
    key('Digit5', '5');
    const input = screen.getByLabelText('Código de convite de Escrita acadêmica');
    fireEvent.change(input, { target: { value: 'errado' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Código errado');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(list);
  });
});

describe('o avatar atrás da janela (US52)', () => {
  it('Gherkin "Setas não andam com o avatar atrás da janela": ← muda só a página', async () => {
    // A tecla sai da lista (que tem o foco) e sobe até a window, onde o avatar também a ouve: só a página pode mudar.
    const { list, key } = setup('phases-portal');
    const avatar = screen.getByTestId('avatar');
    const before = avatar.dataset.x;
    key('ArrowRight');
    key('ArrowLeft');
    await act(() => new Promise((r) => setTimeout(r, 120)));
    fireEvent.keyUp(list, { code: 'ArrowLeft', key: 'ArrowLeft' });
    expect(avatar.dataset.x).toBe(before);
    expect(screen.getByTestId('page')).toHaveTextContent('Página 1 de 3');
  });

  it('sem janela, segurar a seta anda com o avatar quadro a quadro (o laço está ativo)', async () => {
    render(
      <I18nProvider>
        <App world={near('phases-portal')} />
      </I18nProvider>,
    );
    const avatar = screen.getByTestId('avatar');
    const before = Number(avatar.dataset.x);
    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft' });
    // Segurar a tecla anda vários quadros, não um só (o intervalo de cada quadro é fixado antes do atualizador do React).
    await waitFor(() => expect(before - Number(avatar.dataset.x)).toBeGreaterThan(0.5));
    fireEvent.keyUp(window, { code: 'ArrowLeft', key: 'ArrowLeft' });
  });
});
