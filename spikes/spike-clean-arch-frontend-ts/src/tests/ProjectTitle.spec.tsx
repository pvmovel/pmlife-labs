// O componente recebe a dependência pelo Composition Root: em teste, injetamos um fake e não há rede.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@application/AppError';
import type { ConfigGateway } from '@application/Ports/ConfigGateway';
import { InMemoryConfigGateway } from '@infrastructure/InMemoryConfigGateway';
import { DependenciesProvider } from '@presentation/di/DependenciesProvider';
import { ProjectTitle } from '@presentation/components/ProjectTitle';

describe('ProjectTitle com DependenciesProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exibe o título do gateway fake sem nenhuma chamada de rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <DependenciesProvider gateway={new InMemoryConfigGateway('Título Fake', 'Fake Title')}>
        <ProjectTitle language="pt-BR" />
      </DependenciesProvider>,
    );
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByText('Título Fake')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exibe a mensagem da própria UI para o código de erro, nunca o texto do servidor', async () => {
    const failing: ConfigGateway = { getTitles: () => Promise.reject(new AppError('API_ERROR', 'DB_UNAVAILABLE')) };
    render(
      <DependenciesProvider gateway={failing}>
        <ProjectTitle language="en-US" />
      </DependenciesProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable right now.');
    expect(screen.getByRole('alert')).toHaveTextContent('API_ERROR · DB_UNAVAILABLE');
  });
});
