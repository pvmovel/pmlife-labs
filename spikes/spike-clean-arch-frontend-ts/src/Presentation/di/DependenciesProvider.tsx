// Composition Root: ÚNICO ponto da Presentation que conhece adapters concretos.
// Monta os casos de uso e os entrega via Context. Testes podem injetar um gateway próprio.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ConfigGateway } from '@application/Ports/ConfigGateway';
import { GetProjectTitleUseCase } from '@application/UseCases/GetProjectTitleUseCase';
import { HttpConfigGateway } from '@infrastructure/HttpConfigGateway';
import { InMemoryConfigGateway } from '@infrastructure/InMemoryConfigGateway';

export type DataSource = 'http' | 'http-failing' | 'in-memory';

interface Dependencies {
  getProjectTitle: GetProjectTitleUseCase;
}

const DependenciesContext = createContext<Dependencies | null>(null);

/** Escolha do adapter concreto: só aqui. */
function createGateway(source: DataSource): ConfigGateway {
  switch (source) {
    case 'http':
      return new HttpConfigGateway('./api/config.json');
    case 'http-failing':
      return new HttpConfigGateway('./api/config-inexistente.json');
    case 'in-memory':
      return new InMemoryConfigGateway('Plataforma em Memória', 'In-Memory Platform', 300);
  }
}

export function DependenciesProvider({
  source = 'http',
  gateway,
  children,
}: {
  source?: DataSource;
  /** Override para testes: injeta qualquer implementação do Port. */
  gateway?: ConfigGateway;
  children: ReactNode;
}) {
  const deps = useMemo<Dependencies>(
    () => ({ getProjectTitle: new GetProjectTitleUseCase(gateway ?? createGateway(source)) }),
    [gateway, source],
  );
  return <DependenciesContext.Provider value={deps}>{children}</DependenciesContext.Provider>;
}

export function useDependencies(): Dependencies {
  const deps = useContext(DependenciesContext);
  if (!deps) throw new Error('useDependencies deve ser usado dentro de <DependenciesProvider>');
  return deps;
}
