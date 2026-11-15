// O Co-Pilot pela tecla C: abre com o foco na pergunta, Enter pergunta e Esc fecha. Na demo, as respostas são
// prontas, por palavra-chave (Domain/Copilot); no produto, vêm do tutor de IA.
import { useState, type FormEvent } from 'react';
import copilotData from '../../Content/copilot.json';
import { answerFor, toCopilotAnswers } from '../../Domain/Copilot';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

const ANSWERS = toCopilotAnswers(copilotData);

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAnswer(t(answerFor(question, ANSWERS) ?? 'copilot.answers.unknown'));
  };
  return (
    <Modal title={t('copilot.title')} onClose={onClose} testId="copilot">
      <p className="muted">{t('copilot.intro')}</p>
      <form className="chat-form" onSubmit={ask}>
        <input data-autofocus data-testid="copilot-input" aria-label={t('copilot.input')} placeholder={t('copilot.placeholder')} value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
        <button type="submit">{t('copilot.ask')}</button>
      </form>
      <p className="copilot-answer" role="status" data-testid="copilot-answer">
        {answer}
      </p>
    </Modal>
  );
}
