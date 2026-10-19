// A janela de conversa: foco no campo, histórico na tela, memória curta no pedido, erros traduzidos e Esc.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NpcChatError, TalkToNpcUseCase, type NpcChatPort, type Turn } from '../Application/TalkToNpc';
import { toCampus } from '../Domain/Campus';
import { toNpcs } from '../Domain/Npc';
import campusData from '../Content/campus.json';
import npcsData from '../Content/npcs.json';
import { NpcDialogModal } from '../Presentation/HUD/NpcDialogModal';
import { I18nProvider } from '../Presentation/i18n/I18n';

const [guia] = toNpcs(npcsData, toCampus(campusData));

function Harness({ chat, initial = [] }: { chat: NpcChatPort; initial?: Turn[] }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(initial);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setOpen(true)}>conversar</button>
      {open && <NpcDialogModal npc={guia} turns={turns} onTurn={(t) => setTurns((all) => [...all, t])} talk={new TalkToNpcUseCase(chat)} onClose={() => setOpen(false)} />}
    </I18nProvider>
  );
}

const openDialog = () => {
  const opener = screen.getByRole('button', { name: 'conversar' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};
const ask = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
};

describe('NpcDialogModal', () => {
  it('abre com o foco no campo, mostra a saudação e as trocas; Esc fecha e devolve o foco', async () => {
    const chat = { reply: vi.fn<NpcChatPort['reply']>().mockResolvedValueOnce('Primeira.').mockResolvedValueOnce('Segunda.') };
    render(<Harness chat={chat} />);
    const opener = openDialog();
    const dialog = screen.getByRole('dialog', { name: 'Conversa: Guia do Museu' });
    expect(dialog).toHaveTextContent('Pergunte o que quiser sobre o acervo');
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    ask('Quais alas existem?');
    expect(await screen.findByText('Primeira.')).toBeInTheDocument();
    ask('E o relógio?');
    expect(await screen.findByText('Segunda.')).toBeInTheDocument();
    expect(screen.getAllByTestId('npc-answer')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveValue('');
    expect(chat.reply).toHaveBeenLastCalledWith(expect.objectContaining({ persona: 'museum_guide', history: [{ question: 'Quais alas existem?', answer: 'Primeira.' }] }));
    expect(dialog).toHaveTextContent('(2 na memória agora)');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('com 4 trocas na tela, o pedido leva só as 3 últimas', async () => {
    const chat = { reply: vi.fn<NpcChatPort['reply']>().mockResolvedValue('ok') };
    const initial = [1, 2, 3, 4].map((i) => ({ question: `q${i}`, answer: `a${i}` }));
    render(<Harness chat={chat} initial={initial} />);
    openDialog();
    expect(screen.getAllByTestId('npc-answer')).toHaveLength(4);
    ask('q5');
    await waitFor(() => expect(chat.reply).toHaveBeenCalled());
    expect(chat.reply.mock.calls[0][0].history.map((t) => t.question)).toEqual(['q2', 'q3', 'q4']);
  });

  it('erro do servidor aparece traduzido e a pergunta continua no campo', async () => {
    const chat = { reply: vi.fn<NpcChatPort['reply']>().mockRejectedValue(new NpcChatError('INVALID_PERSONA')) };
    render(<Harness chat={chat} />);
    openDialog();
    ask('Oi');
    expect(await screen.findByRole('alert')).toHaveTextContent('Este personagem não está disponível.');
    expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveValue('Oi');
  });

  it('enquanto espera a resposta, avisa que o NPC está pensando e não envia de novo', async () => {
    let resolve: (s: string) => void = () => {};
    const chat = { reply: vi.fn<NpcChatPort['reply']>().mockImplementation(() => new Promise((r) => (resolve = r))) };
    render(<Harness chat={chat} />);
    openDialog();
    ask('Oi');
    expect(screen.getByRole('status')).toHaveTextContent('Guia do Museu está pensando…');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    resolve('Olá!');
    expect(await screen.findByText('Olá!')).toBeInTheDocument();
    expect(chat.reply).toHaveBeenCalledTimes(1);
  });
});
