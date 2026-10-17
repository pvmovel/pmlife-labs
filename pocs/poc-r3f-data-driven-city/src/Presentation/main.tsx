import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DependenciesProvider } from './di/DependenciesProvider';
import { I18nProvider } from './i18n/I18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DependenciesProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </DependenciesProvider>
  </StrictMode>,
);
