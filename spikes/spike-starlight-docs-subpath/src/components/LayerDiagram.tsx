// Diagrama das camadas: clicar numa camada mostra o que ela contém e o que ela pode (e não pode) importar, a mesma
// matriz que o ESLint aplica no código. As outras camadas acendem em verde (permitido) ou ficam riscadas (proibido).
import { useState } from 'react';

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly contains: string;
  readonly example: string;
  /** Camadas que esta pode importar (inclui ela mesma). */
  readonly canImport: readonly string[];
}

export interface LayerLabels {
  hint: string;
  contains: string;
  example: string;
  canImport: string;
  cannotImport: string;
  none: string;
}

export default function LayerDiagram({ layers, labels }: { layers: readonly Layer[]; labels: LayerLabels }) {
  const [selected, setSelected] = useState<string>(layers[0].id);
  const current = layers.find((l) => l.id === selected)!;
  const allowed = new Set(current.canImport);
  const names = (ids: readonly string[]) => ids.map((id) => layers.find((l) => l.id === id)?.name ?? id);
  const forbidden = layers.filter((l) => !allowed.has(l.id)).map((l) => l.id);

  return (
    <div data-testid="layer-diagram" className="not-content">
      <p style={{ marginTop: 0 }}>{labels.hint}</p>
      <div role="group" aria-label={labels.hint} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {layers.map((l) => {
          const state = l.id === selected ? 'selected' : allowed.has(l.id) ? 'allowed' : 'forbidden';
          return (
            <button
              key={l.id}
              type="button"
              data-layer={l.id}
              data-state={state}
              aria-pressed={l.id === selected}
              onClick={() => setSelected(l.id)}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600,
                border: `2px solid ${state === 'selected' ? 'var(--sl-color-text-accent)' : state === 'allowed' ? '#16a34a' : 'var(--sl-color-gray-5)'}`,
                background: state === 'selected' ? 'var(--sl-color-accent-low)' : 'var(--sl-color-bg)',
                color: 'var(--sl-color-text)',
                textDecoration: state === 'forbidden' ? 'line-through' : 'none',
                opacity: state === 'forbidden' ? 0.6 : 1,
              }}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      <div data-testid="layer-details" aria-live="polite" style={{ border: '1px solid var(--sl-color-gray-5)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
        <h3 style={{ marginTop: 0 }}>{current.name}</h3>
        <p><strong>{labels.contains}:</strong> {current.contains}</p>
        <p><strong>{labels.example}:</strong> <code>{current.example}</code></p>
        <p data-testid="can-import"><strong>{labels.canImport}:</strong> {names(current.canImport.filter((id) => id !== current.id)).join(', ') || labels.none}</p>
        <p data-testid="cannot-import" style={{ marginBottom: 0 }}><strong>{labels.cannotImport}:</strong> {names(forbidden).join(', ') || labels.none}</p>
      </div>
    </div>
  );
}
