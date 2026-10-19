// Widget do tutor: pergunta ➔ caso de uso ➔ resposta, quem respondeu e os trechos usados. Erros por código.
import { useState } from 'react';
import { AiError, MAX_QUESTION, type AskTutorUseCase, type TutorAnswer } from '../Application/AskTutor';
import { EXAMPLES, TEXTS } from './texts';

export function CoPilotWidget({ askTutor }: { askTutor: AskTutorUseCase }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TutorAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askTutor.execute(q));
    } catch (e) {
      setError(TEXTS.errors[e instanceof AiError ? e.code : 'INVALID_RESPONSE']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="tutor-title">
      <h2 id="tutor-title">{TEXTS.widgetTitle}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="question">{TEXTS.label}</label>
        <textarea
          id="question"
          value={question}
          maxLength={MAX_QUESTION}
          rows={3}
          placeholder={TEXTS.placeholder}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="row">
          <span className="muted counter">
            {question.length}/{MAX_QUESTION}
          </span>
          <button type="submit" disabled={busy || question.trim() === ''}>
            {busy ? TEXTS.asking : TEXTS.ask}
          </button>
        </div>
      </form>
      <div className="examples">
        <span className="muted">{TEXTS.examples}</span>
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => {
              setQuestion(q);
              void ask(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {result && (
          <div className="answer" data-testid="answer">
            <h3>{TEXTS.answerTitle}</h3>
            <p>{result.answer}</p>
            <p className="muted notice">
              {TEXTS.aiNotice} {TEXTS.by} <strong data-testid="provider">{result.provider}</strong>.
            </p>
            <h3>{TEXTS.sources}</h3>
            {result.sources.length ? (
              <ol className="sources">
                {result.sources.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}.</strong> {s.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">{TEXTS.noSources}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
