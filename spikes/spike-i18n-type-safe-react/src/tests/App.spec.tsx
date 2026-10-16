import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18nProvider';

const renderApp = () =>
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );

describe('Demo: troca de idioma', () => {
  it('troca todos os textos e o <html lang> na hora', async () => {
    renderApp();
    expect(screen.getByTestId('app-name')).toHaveTextContent('Minha Plataforma');
    expect(document.documentElement.lang).toBe('pt-BR');

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByTestId('app-name')).toHaveTextContent('My Platform');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No hardcoded text, no wrong keys');
    expect(document.documentElement.lang).toBe('en-US');
    expect(await screen.findByText('<html lang="en-US">')).toBeInTheDocument();
  });

  it('lembra o idioma escolhido', () => {
    const first = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    first.unmount();
    renderApp();
    expect(screen.getByTestId('app-name')).toHaveTextContent('My Platform');
  });
});
