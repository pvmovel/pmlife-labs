// "Siga uma funcionalidade": um caso real atravessando as camadas, passo a passo, do clique à gravação. Cada passo diz
// em que camada e em que arquivo está, e o que acontece ali. Navegação por botões e pelas setas do teclado.
import { useState, type KeyboardEvent } from 'react';

export interface WalkStep {
  readonly layer: string;
  readonly layerName: string;
  readonly file: string;
  readonly title: string;
  readonly text: string;
}

export interface WalkLabels {
  previous: string;
  next: string;
  step: string;
  of: string;
  file: string;
}

export default function FeatureWalkthrough({ steps, labels }: { steps: readonly WalkStep[]; labels: WalkLabels }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const go = (n: number) => setI(Math.max(0, Math.min(steps.length - 1, n)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  };

  return (
    <div data-testid="walkthrough" data-step={i + 1} className="not-content" onKeyDown={onKey}>
      <ol aria-label={labels.step} style={{ display: 'flex', gap: '0.35rem', listStyle: 'none', padding: 0, margin: '0 0 0.75rem', flexWrap: 'wrap' }}>
        {steps.map((s, n) => (
          <li key={n}>
            <button
              type="button"
              aria-current={n === i ? 'step' : undefined}
              aria-label={`${labels.step} ${n + 1}: ${s.title}`}
              onClick={() => go(n)}
              style={{ width: '2rem', height: '2rem', borderRadius: '999px', cursor: 'pointer', fontWeight: 700, border: '2px solid var(--sl-color-text-accent)', background: n <= i ? 'var(--sl-color-text-accent)' : 'transparent', color: n <= i ? 'var(--sl-color-black)' : 'var(--sl-color-text)' }}
            >
              {n + 1}
            </button>
          </li>
        ))}
      </ol>
      <div aria-live="polite" style={{ border: '1px solid var(--sl-color-gray-5)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'var(--sl-color-gray-3)' }}>
          {labels.step} {i + 1} {labels.of} {steps.length} · <span data-testid="walk-layer" data-layer={step.layer}>{step.layerName}</span>
        </p>
        <h3 data-testid="walk-title" style={{ margin: '0 0 0.5rem' }}>{step.title}</h3>
        <p style={{ margin: '0 0 0.5rem' }}>{step.text}</p>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>
          {labels.file}: <code>{step.file}</code>
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} style={navStyle}>← {labels.previous}</button>
        <button type="button" onClick={() => go(i + 1)} disabled={i === steps.length - 1} style={navStyle}>{labels.next} →</button>
      </div>
    </div>
  );
}

const navStyle = { padding: '0.4rem 0.9rem', borderRadius: '0.4rem', border: '1px solid var(--sl-color-gray-5)', background: 'var(--sl-color-bg)', color: 'var(--sl-color-text)', cursor: 'pointer' } as const;
