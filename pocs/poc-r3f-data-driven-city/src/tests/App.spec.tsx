// Página: loader traduzido enquanto o chunk 3D carrega (Gherkin: carregamento progressivo) e troca de trilha.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../Presentation/App';
import { DependenciesProvider } from '../Presentation/di/DependenciesProvider';
import { I18nProvider } from '../Presentation/i18n/I18n';

// O chunk da cena (three.js) só "chega" quando o teste mandar: dá para ver o loader do Suspense.
const gate = vi.hoisted(() => {
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => (release = resolve));
  return { opened, release: () => release() };
});
vi.mock('../Presentation/Engine3D/CityCanvas3D', async () => {
  await gate.opened;
  return { default: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> };
});

const renderApp = () =>
  render(
    <DependenciesProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </DependenciesProvider>,
  );

describe('App', () => {
  it('mostra o loader traduzido até a cena carregar; depois, a cena com aria-label; troca trilha e idioma', async () => {
    renderApp();
    // A cidade já foi lida (o JSON aparece), mas o chunk 3D ainda não: o loader é o do Suspense.
    expect(await screen.findByTestId('city-json')).toBeInTheDocument();
    expect(screen.getByTestId('loader')).toHaveTextContent('Carregando a cidade 3D…');

    await act(async () => gate.release());
    expect(await screen.findByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('Culinária, com 4 prédios'));

    fireEvent.click(screen.getByRole('button', { name: 'Idiomas' }));
    expect(await screen.findByRole('img', { name: /Idiomas, com 3 prédios/ })).toBeInTheDocument();
    expect(screen.getByTestId('city-json')).toHaveTextContent('"trackId": "idiomas"');

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('img', { name: /Languages track, with 3 buildings/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-US');
  });
});
