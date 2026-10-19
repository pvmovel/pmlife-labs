// Conversa com um NPC (US22b): histórico na tela, campo de texto e memória curta. A tela mostra a conversa
// inteira; o caso de uso manda ao servidor só as 3 últimas trocas.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_HISTORY_TURNS, MAX_NPC_MESSAGE, NpcChatError, type NpcChatErrorCode, type TalkToNpcUseCase, type Turn } from '../../Application/TalkToNpc';
import type { Npc } from '../../Domain/Npc';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

interface Props {
  npc: Npc;
  /** A conversa até aqui (fica na página: fechar e reabrir não apaga). */
  turns: readonly Turn[];
  onTurn: (turn: Turn) => void;
  talk: Pick<TalkToNpcUseCase, 'execute'>;
  onClose: () => void;
}

export function NpcDialogModal({ npc, turns, onTurn, talk, onClose }: Props) {
  const { t, language } = useI18n();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NpcChatErrorCode | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const name = t(npc.labelKey);

  // A troca mais nova sempre à vista.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns.length, pending]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onTurn(await talk.execute(npc.persona, draft, turns, language));
      setDraft('');
    } catch (err) {
      setError(err instanceof NpcChatError ? err.code : 'NETWORK');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t('dialog.title', { npc: name })} onClose={onClose} testId="npc-dialog">
      <p className="npc-greeting">{t(`npcs.${npc.id}.greeting`)}</p>
      <ol ref={log} className="chat" data-testid="npc-history" aria-label={t('dialog.history')}>
        {turns.map((turn, i) => (
          <li key={i}>
            <p className="chat-q">
              <strong>{t('dialog.you')}</strong> {turn.question}
            </p>
            <p className="chat-a" data-testid="npc-answer">
              <strong>{name}</strong> {turn.answer}
            </p>
          </li>
        ))}
      </ol>
      <p className="chat-status" role="status">
        {pending ? t('dialog.thinking', { npc: name }) : ''}
      </p>
      {error && (
        <p className="chat-error" role="alert">
          {t(`dialog.errors.${error}`)}
        </p>
      )}
      <form className="chat-form" onSubmit={send}>
        <label className="sr-only" htmlFor={`npc-input-${npc.id}`}>
          {t('dialog.inputLabel')}
        </label>
        <input
          id={`npc-input-${npc.id}`}
          type="text"
          data-autofocus
          data-testid="npc-input"
          autoComplete="off"
          maxLength={MAX_NPC_MESSAGE}
          placeholder={t('dialog.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={pending || !draft.trim()}>
          {t('dialog.send')}
        </button>
      </form>
      <p className="muted small">
        {t('dialog.memory', { max: MAX_HISTORY_TURNS, count: Math.min(turns.length, MAX_HISTORY_TURNS) })} {t('dialog.mock')}
      </p>
    </Modal>
  );
}
