// Composition Root: único ponto da Presentation que conhece o adapter concreto do currículo.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CurriculumRepository } from '../../Application/Ports/CurriculumRepository';
import { JsonCurriculumAdapter } from '../../Infrastructure/JsonCurriculumAdapter';

const Ctx = createContext<CurriculumRepository | null>(null);

export function DependenciesProvider({ curriculum, children }: { curriculum?: CurriculumRepository; children: ReactNode }) {
  const repo = useMemo(() => curriculum ?? new JsonCurriculumAdapter(), [curriculum]);
  return <Ctx.Provider value={repo}>{children}</Ctx.Provider>;
}

export function useCurriculum(): CurriculumRepository {
  const repo = useContext(Ctx);
  if (!repo) throw new Error('useCurriculum fora do DependenciesProvider');
  return repo;
}
