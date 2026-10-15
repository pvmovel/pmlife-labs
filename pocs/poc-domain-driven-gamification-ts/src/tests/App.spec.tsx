// A demo usa o domínio de verdade: salto de níveis, idempotência e troca de trilha.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../Presentation/App';

describe('Demo da PoC', () => {
  it('+3000 XP de uma vez: motor vai ao terceiro nível; o if/else ingênuo para no segundo', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+3000 XP' }));
    expect(screen.getByTestId('level')).toHaveTextContent('Sous-chef');
    expect(screen.getByTestId('naive-level')).toHaveTextContent('Cozinheiro');
  });

  it('missão repetida não soma XP', () => {
    render(<App />);
    const quest = () => screen.getByRole('button', { name: /Preparar um molho base/ });
    fireEvent.click(quest());
    fireEvent.click(quest());
    expect(screen.getByTestId('xp')).toHaveTextContent('800');
    expect(screen.getByText(/já foi concluída: nenhum XP somado/)).toBeInTheDocument();
  });

  it('outra trilha usa a própria escada', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Trilha de Idiomas' }));
    fireEvent.click(screen.getByRole('button', { name: '+3000 XP' }));
    expect(screen.getByTestId('level')).toHaveTextContent('B2');
  });
});
