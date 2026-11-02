// O admin na tela, com os cenários do Gherkin da US36: o master da plataforma cria uma instituição, o master da
// instituição só vê a própria, o aluno é recusado; e a tabela, as confirmações, os papéis de autor e tutor e o inglês.
import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n';
import { useAdminStore } from '../Presentation/useAdminStore';

const open = (actor: string) =>
  render(
    <I18nProvider>
      <App initialActor={actor} />
    </I18nProvider>,
  );
const nav = () => within(screen.getByRole('navigation', { name: 'Seções do admin' }));
const go = (section: string) => fireEvent.click(nav().getByRole('button', { name: section }));
const table = () => screen.getByRole('table');
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Gherkin da US36', () => {
  it('Master da plataforma cria uma instituição e o master dela recebe o acesso', () => {
    open('platform');
    expect(screen.getByRole('heading', { level: 1, name: 'Instituições' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nova instituição' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nova instituição' }));
    type('Nome da instituição', 'Escola Litoral');
    expect(screen.getByLabelText('Endereço (slug)')).toHaveValue('escola-litoral');
    type('E-mail do master da instituição', 'rita@litoral.test');
    fireEvent.click(dialog.getByRole('button', { name: 'Criar instituição' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('notice')).toHaveTextContent('Escola Litoral criada. O master (rita@litoral.test) recebe o acesso ao admin dela.');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'litoral' } });
    expect(within(table()).getByText('Escola Litoral')).toBeInTheDocument();
    go('Auditoria');
    const row = within(table()).getByText('Escola Litoral').closest('tr')!;
    expect(row).toHaveTextContent('master@pmlife.test');
    expect(row).toHaveTextContent('criou a instituição');
  });

  it('Master da instituição só vê a própria: sem Instituições, sem escolher instituição e sem pessoas de outra', () => {
    open('aurora-admin');
    expect(nav().queryByRole('button', { name: 'Instituições' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Instituição')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Pessoas de Escola Aurora' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: '@horizonte' } });
    expect(within(table()).getByText('Nada encontrado.')).toBeInTheDocument();
  });

  it('Aluno não acessa o admin', () => {
    open('aurora-student');
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso recusado');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('a ação fora do papel é recusada também no estado (como o servidor), não só escondida', () => {
    const { result } = renderHook(() => useAdminStore({ role: 'tenant_admin', tenant: 'aurora' }, 'Ana'));
    expect(() => result.current.deactivateMember('horizonte-4')).toThrow('FORBIDDEN');
    expect(() => result.current.createInstitution({ name: 'X', slug: 'xx', masterEmail: 'a@b.test' })).toThrow('FORBIDDEN');
  });
});

describe('formulário, tabela e confirmações', () => {
  it('o formulário mostra os erros traduzidos, marca os campos e põe o foco no primeiro', () => {
    open('platform');
    fireEvent.click(screen.getByRole('button', { name: 'Nova instituição' }));
    type('Endereço (slug)', 'aurora');
    fireEvent.click(screen.getByRole('button', { name: 'Criar instituição' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija os campos marcados.');
    expect(screen.getByLabelText('Nome da instituição')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nome da instituição')).toHaveFocus();
    expect(screen.getByLabelText('Nome da instituição')).toHaveAccessibleDescription('Preencha este campo.');
    expect(screen.getByLabelText('Endereço (slug)')).toHaveAccessibleDescription(/Esse endereço já é de outra instituição\./);
  });

  it('busca sem acento, ordena pelo cabeçalho e pagina', () => {
    open('aurora-admin');
    expect(screen.getByText('Página 1 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Página 2 de 4')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'joao' } });
    expect(screen.getByText('1 resultado(s)')).toBeInTheDocument();
    expect(within(table()).getByText('João Campos')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument();
    const sortName = screen.getByRole('button', { name: 'Ordenar por Nome' });
    fireEvent.click(sortName);
    expect(sortName.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(sortName);
    expect(sortName.closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('desativar pede confirmação: Cancelar não muda nada, o foco começa em Cancelar e Esc fecha', () => {
    open('aurora-admin');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'Bruno' } });
    const deactivate = screen.getByRole('button', { name: 'Desativar: Bruno Rocha' });
    deactivate.focus();
    fireEvent.click(deactivate);
    const confirm = screen.getByRole('alertdialog', { name: 'Desativar Bruno Rocha?' });
    expect(within(confirm).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deactivate).toHaveFocus();

    fireEvent.click(deactivate);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desativar' }));
    expect(within(table()).getByText('Desativado')).toBeInTheDocument();
    go('Auditoria');
    expect(within(table()).getByText('Bruno Rocha').closest('tr')).toHaveTextContent('desativou a pessoa');
  });

  it('aprovar sai da fila na hora; recusar pede confirmação', () => {
    open('aurora-admin');
    go('Matrículas');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar: Lucas Teixeira' }));
    expect(screen.getByTestId('notice')).toHaveTextContent('Lucas Teixeira matriculado(a) em Concursos.');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar: Marina Moura' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Recusar o pedido de Marina Moura?' })).getByRole('button', { name: 'Recusar' }));
    expect(within(table()).queryByText('Marina Moura')).not.toBeInTheDocument();
    expect(within(table()).getByText('Paulo Campos')).toBeInTheDocument();
  });
});

describe('papéis de curso e idioma', () => {
  it('o autor só publica os cursos em que foi designado', () => {
    open('aurora-author');
    expect(nav().getAllByRole('button').map((b) => b.textContent)).toEqual(['Cursos']);
    expect(screen.getByRole('button', { name: 'Publicar: Concursos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ENEM/ })).not.toBeInTheDocument();
    expect(within(table()).getByText('Só os autores designados')).toBeInTheDocument();
  });

  it('o tutor acompanha as pessoas sem poder alterar', () => {
    open('aurora-tutor');
    expect(screen.getByText('Somente leitura: o tutor acompanha, sem alterar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Desativar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('o master da plataforma escolhe a instituição em foco nas seções dela', () => {
    open('platform');
    go('Pessoas');
    fireEvent.change(screen.getByLabelText('Instituição'), { target: { value: 'horizonte' } });
    expect(screen.getByRole('table', { name: 'Pessoas de Colégio Horizonte' })).toBeInTheDocument();
  });

  it('em inglês, a navegação, a tabela e o lang do documento mudam', () => {
    open('platform');
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en-US' } });
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.title).toBe('PMLife · Administration');
    expect(screen.getByRole('heading', { level: 1, name: 'Institutions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New institution' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });
});
