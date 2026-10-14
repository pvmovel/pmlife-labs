// Demo: a mesma UI com três fontes de dados. Só o Composition Root muda; o componente não.
import { useState } from 'react';
import type { Language } from '@domain/ProjectTitles';
import { DependenciesProvider, type DataSource } from './di/DependenciesProvider';
import { ProjectTitle } from './components/ProjectTitle';

const SOURCES: { id: DataSource; label: string; hint: string }[] = [
  { id: 'http', label: 'HTTP', hint: 'HttpConfigGateway lendo ./api/config.json no envelope do contrato' },
  { id: 'http-failing', label: 'HTTP com falha', hint: 'HttpConfigGateway apontando para uma URL inexistente (404)' },
  { id: 'in-memory', label: 'Em memória', hint: 'InMemoryConfigGateway: mesma interface, sem rede' },
];

const LAYERS = [
  ['Componente', 'ProjectTitle.tsx', 'só renderiza o estado'],
  ['Hook', 'useProjectTitle.ts', 'chama o caso de uso do provider'],
  ['Composition Root', 'di/DependenciesProvider.tsx', 'único lugar que escolhe o adapter'],
  ['Caso de uso', 'GetProjectTitleUseCase.ts', 'depende só do Port'],
  ['Port', 'ConfigGateway.ts', 'interface'],
  ['Adapter', 'HttpConfigGateway.ts · InMemoryConfigGateway.ts', 'implementações trocáveis'],
] as const;

export function App() {
  const [source, setSource] = useState<DataSource>('http');
  const [language, setLanguage] = useState<Language>('pt-BR');
  const current = SOURCES.find((s) => s.id === source)!;

  return (
    <main className="page">
      <p className="eyebrow">Spike · Clean Architecture no front</p>
      <h1>Troque a fonte de dados sem tocar na interface</h1>

      <section className="card">
        <div className="row">
          <div className="group" role="group" aria-label="Fonte de dados">
            {SOURCES.map((s) => (
              <button key={s.id} type="button" aria-pressed={s.id === source} onClick={() => setSource(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="group" role="group" aria-label="Idioma">
            {(['pt-BR', 'en-US'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={l === language} onClick={() => setLanguage(l)}>
                {l === 'pt-BR' ? 'PT' : 'EN'}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">{current.hint}</p>
        <div className="stage">
          <DependenciesProvider source={source}>
            <ProjectTitle language={language} />
          </DependenciesProvider>
        </div>
      </section>

      <section className="card">
        <h2>O caminho da chamada</h2>
        <ol className="layers">
          {LAYERS.map(([name, file, role]) => (
            <li key={name}>
              <strong>{name}</strong>
              <code>{file}</code>
              <span>{role}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
