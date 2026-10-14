// Componente "burro": só renderiza o estado do hook. Não sabe se o dado veio de HTTP ou da memória.
import type { Language } from '@domain/ProjectTitles';
import { useProjectTitle } from '../hooks/useProjectTitle';
import { messages } from './messages';

export function ProjectTitle({ language }: { language: Language }) {
  const state = useProjectTitle(language);
  const text = messages[language];

  if (state.status === 'loading') return <p className="title title--muted">{text.loading}</p>;
  if (state.status === 'error') {
    return (
      <p className="title title--error" role="alert">
        {text.errors[state.code]}
        <code className="code">{state.apiCode ? `${state.code} · ${state.apiCode}` : state.code}</code>
      </p>
    );
  }
  return <p className="title">{state.title}</p>;
}
