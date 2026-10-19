import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoPilotWidget } from '../Presentation/CoPilotWidget';
import { createAskTutor } from '../Presentation/di/dependencies';

const fetchReturning = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('CoPilotWidget', () => {
  it('mostra a resposta, quem respondeu, o aviso de IA e os trechos usados', async () => {
    const f = fetchReturning(200, { status: 'success', data: { answer: 'Na lua cheia.', provider: 'groq' } });
    render(<CoPilotWidget askTutor={createAskTutor(f)} />);
    fireEvent.change(screen.getByLabelText('Sua pergunta'), { target: { value: 'Quando acontece o eclipse lunar?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Perguntar' })));

    expect(screen.getByTestId('answer')).toHaveTextContent('Na lua cheia.');
    expect(screen.getByTestId('provider')).toHaveTextContent('groq');
    expect(screen.getByText(/Resposta gerada por IA/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Eclipse lunar.');
    expect(f).toHaveBeenCalledWith('../public/ai_chat.php', expect.anything());
  });

  it('limite por IP: mensagem amigável, sem texto do servidor', async () => {
    render(<CoPilotWidget askTutor={createAskTutor(fetchReturning(429, { status: 'error', error: { code: 'RATE_LIMITED' } }))} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Como ganho o certificado?' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas perguntas seguidas');
  });
});
