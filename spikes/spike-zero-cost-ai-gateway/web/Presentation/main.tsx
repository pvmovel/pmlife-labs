import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CoPilotWidget } from './CoPilotWidget';
import { createAskTutor } from './di/dependencies';
import { TEXTS } from './texts';
import './styles.css';

const askTutor = createAskTutor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">{TEXTS.back}</a>
        <a className="btn" href="../../../catalogo/spike-zero-cost-ai-gateway/">{TEXTS.docs}</a>
      </nav>
      <p className="eyebrow">{TEXTS.eyebrow}</p>
      <h1>{TEXTS.title}</h1>
      <p className="lead">{TEXTS.lead}</p>
      <CoPilotWidget askTutor={askTutor} />
    </main>
  </StrictMode>,
);
