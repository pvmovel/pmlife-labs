// A tela da US49 com os cenários do Gherkin: criar o primeiro curso (do modelo mínimo, abrindo o editor), montar a
// fase 2 com uma missão e publicar (o aluno vê a fase 2 depois da 1), o curso inválido não é publicado e o problema leva
// ao campo, só os masters criam (o "servidor" recusa o autor), as abas pelo teclado e o inglês.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COURSE_TEMPLATE } from '../Content/institution';
import { newDocument } from '../Domain/Drafts';
import { updateQuest } from '../Domain/editing';
import { fromTemplate } from '../Domain/template';
import { App } from '../Presentation/App';
import { I18nProvider, type Language } from '../Presentation/i18n';
import { useBuilder } from '../Presentation/useBuilder';

const mount = (language: Language = 'pt-BR') =>
  render(
    <I18nProvider initial={language}>
      <App />
    </I18nProvider>,
  );
const type = (label: string, value: string, scope: ReturnType<typeof within> = within(document.body)) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
const notice = () => screen.getByTestId('notice');

/** Cria o "Inglês Básico" pela tela. */
function createCourse() {
  fireEvent.click(screen.getByRole('button', { name: 'Novo curso' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Novo curso' }));
  type('Nome curto', 'ingles-basico', dialog);
  type('Título em português', 'Inglês Básico', dialog);
  type('Título em inglês', 'Basic English', dialog);
  fireEvent.click(dialog.getByRole('button', { name: 'Criar o curso' }));
}

describe('US49: criar um curso do zero pelo admin', () => {
  it('Gherkin "Criar o primeiro curso": a instituição sem cursos cria o "Inglês Básico", que nasce do modelo e abre no editor', () => {
    mount();
    expect(screen.getByText(/A instituição ainda não tem cursos/)).toBeInTheDocument();
    createCourse();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Inglês Básico' })).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('Rascunho: os alunos ainda não veem este curso.');
    expect(notice()).toHaveTextContent('Inglês Básico criado a partir do modelo.');
    expect(within(screen.getByTestId('problems')).getByText('Nenhum problema: pode publicar.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Curso e níveis' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Nível 1' })).toBeInTheDocument();
  });

  it('o "Novo curso" recusa o nome curto fora do formato, o repetido e o título faltando, sem criar nada', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Novo curso' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Novo curso' }));
    type('Nome curto', 'Inglês!', dialog);
    fireEvent.click(dialog.getByRole('button', { name: 'Criar o curso' }));
    expect(dialog.getByText(/Use letras minúsculas, números e hífen/)).toBeInTheDocument();
    expect(dialog.getByText('Preencha o título nos dois idiomas.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Nome curto')).toHaveFocus();
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    createCourse();
    fireEvent.click(screen.getByRole('button', { name: /Voltar aos cursos/ }));
    createCourse();
    expect(within(screen.getByRole('dialog')).getByText('A instituição já tem um curso com esse nome curto.')).toBeInTheDocument();
  });

  it('Gherkin "Montar as fases e as missões": a fase 2 com uma missão, publicada, aparece para o aluno depois da 1', async () => {
    mount();
    createCourse();
    fireEvent.click(screen.getByRole('tab', { name: 'Fases' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar fase' }));
    const phase2 = within(screen.getByRole('region', { name: 'Fase 2' }));
    type('Nome em português', 'Conversação', phase2);
    type('Nome em inglês', 'Conversation', phase2);
    expect(phase2.getByRole('checkbox', { name: 'Fase 1' })).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Missões' }));
    fireEvent.change(screen.getByLabelText('Fase'), { target: { value: '1' } });
    expect(screen.getByText('Esta fase ainda não tem missões.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar missão' }));
    const quest = within(screen.getByRole('region', { name: 'Missão 1' }));
    type('Título em português', 'Pedir um café', quest);
    type('Título em inglês', 'Order a coffee', quest);
    type('XP', '250', quest);
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(notice()).toHaveTextContent('Publicado: versão 1. Os alunos já veem.');
    expect(screen.getByTestId('status')).toHaveTextContent('Publicado: versão 1. Sem rascunho.');
    fireEvent.click(screen.getByRole('button', { name: 'Visão do aluno' }));
    const student = within(screen.getByTestId('student'));
    const items = student.getAllByRole('listitem').filter((li) => li.parentElement?.tagName === 'OL');
    expect(items.map((li) => li.querySelector('strong')?.textContent)).toEqual(['Fase 1', 'Conversação']);
    expect(items[1]).toHaveTextContent('depois de: Fase 1');
    expect(items[1]).toHaveTextContent('Pedir um café · Sala de aula · 250 XP');
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
  });

  it('Gherkin "Curso inválido não é publicado": a missão num prédio que não existe na fase é recusada, e o problema leva ao campo', () => {
    const bad = updateQuest(fromTemplate(COURSE_TEMPLATE, 'escola-idiomas', { slug: 'ingles', title: { pt: 'Inglês', en: 'English' } }), 0, 0, { buildingId: 'predio-9' });
    function Seeded() {
      const b = useBuilder({ courses: [newDocument('ingles', bad)] });
      return <App builder={b} />;
    }
    render(
      <I18nProvider>
        <Seeded />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir: Inglês' }));
    const problem = within(screen.getByTestId('problems')).getByRole('button', { name: 'Missão 1 da fase 1: a missão está num prédio que não existe nesta fase.' });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(notice()).toHaveTextContent('Não publicado: 1 problema(s).');
    expect(screen.getByTestId('status')).toHaveTextContent('Rascunho: os alunos ainda não veem este curso.');
    fireEvent.click(problem);
    expect(screen.getByRole('tab', { name: 'Missões' })).toHaveAttribute('aria-selected', 'true');
    const select = screen.getByLabelText('Prédio');
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(select, { target: { value: 'predio-1' } });
    expect(within(screen.getByTestId('problems')).getByText('Nenhum problema: pode publicar.')).toBeInTheDocument();
  });

  it('Gherkin "Só os masters criam cursos": o autor não vê o "Novo curso", e o servidor recusa o pedido dele', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Novo curso' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Novo curso' }));
    // O papel muda com a janela aberta (como uma sessão que perdeu o papel): o "servidor" confere o papel no pedido.
    fireEvent.change(screen.getByLabelText('Papel (demonstração)'), { target: { value: 'author' } });
    type('Nome curto', 'ingles', dialog);
    type('Título em português', 'Inglês', dialog);
    type('Título em inglês', 'English', dialog);
    fireEvent.click(dialog.getByRole('button', { name: 'Criar o curso' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('O servidor recusou: só os masters criam cursos.');
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Novo curso' })).not.toBeInTheDocument();
    expect(screen.getByText(/Só o master da instituição/)).toBeInTheDocument();
  });

  it('a escada de níveis e os atributos: o nível novo, o XP fora de ordem apontado e os pontos dos atributos do curso', () => {
    mount();
    createCourse();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar nível' }));
    const level2 = within(screen.getByRole('region', { name: 'Nível 2' }));
    expect(level2.getByLabelText('XP mínimo')).toHaveValue(1000);
    expect(level2.getByLabelText('Fala mínimo')).toHaveValue(0);
    type('XP mínimo', '0', level2);
    expect(within(screen.getByTestId('problems')).getByText('Nível 2: o XP precisa ser maior que o do nível anterior.')).toBeInTheDocument();
    expect(level2.getByLabelText('XP mínimo')).toHaveAttribute('aria-invalid', 'true');
    type('XP mínimo', '2000', level2);
    fireEvent.click(screen.getByRole('tab', { name: 'Missões' }));
    expect(screen.getByLabelText('Pontos de Fala')).toHaveValue(0);
  });

  it('as abas pelo teclado (setas) e o editor em inglês', () => {
    mount('en-US');
    fireEvent.click(screen.getByRole('button', { name: 'New course' }));
    const dialog = within(screen.getByRole('dialog', { name: 'New course' }));
    type('Short name', 'english', dialog);
    type('Title in Portuguese', 'Inglês', dialog);
    type('Title in English', 'English', dialog);
    fireEvent.click(dialog.getByRole('button', { name: 'Create the course' }));
    const first = screen.getByRole('tab', { name: 'Course and levels' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Phases' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Phases' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Phases' }), { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    expect(screen.getByText('No problems: ready to publish.')).toBeInTheDocument();
  });
});
