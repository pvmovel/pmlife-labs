// O chat da turma pela tecla T: abre com o foco no campo da mensagem, Enter envia e Esc fecha (o foco volta para a
// cena). Enquanto se digita, nenhuma letra dispara atalho: "t", "c", "m" e "h" são só texto. Na demo, os colegas e as
// mensagens são inventados e ficam na memória.
import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

interface Message {
  readonly id: number;
  readonly from: string;
  readonly text: string;
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [mine, setMine] = useState<Message[]>([]);
  const seed: Message[] = [
    { id: -2, from: 'Ana', text: t('chat.seed1') },
    { id: -1, from: 'Bruno', text: t('chat.seed2') },
  ];
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMine((m) => [...m, { id: m.length, from: t('chat.me'), text }]);
    setDraft('');
  };
  return (
    <Modal title={t('chat.title')} onClose={onClose} testId="chat">
      <ul className="chat-log" role="log" aria-live="polite" aria-label={t('chat.log')} data-testid="chat-log">
        {[...seed, ...mine].map((m) => (
          <li key={m.id}>
            <strong>{m.from}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <form className="chat-form" onSubmit={send}>
        <input data-autofocus data-testid="chat-input" aria-label={t('chat.input')} placeholder={t('chat.input')} value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit">{t('chat.send')}</button>
      </form>
    </Modal>
  );
}
