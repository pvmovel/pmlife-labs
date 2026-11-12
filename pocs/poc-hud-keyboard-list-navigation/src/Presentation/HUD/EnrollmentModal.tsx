// As Matrículas (US52): a mesma lista; o número faz o que o botão do curso faz. No curso por código, ele leva ao campo
// do código (o Enter envia; o Esc volta à lista, sem fechar a janela). Digitar no campo nunca escolhe outro curso.
import { useRef, useState, type FormEvent } from 'react';
import { codeAccepted, DEMO_CODE, enrollChoice, type EnrollStatus } from '../../Domain/Enrollment';
import type { World } from '../world';
import { useI18n } from '../i18n/I18n';
import { KeyboardList, type ListItemView } from './KeyboardList';
import { Modal } from './Modal';

export function EnrollmentModal({ world, onClose }: { world: World; onClose: () => void }) {
  const { t, language } = useI18n();
  const [statuses, setStatuses] = useState<Record<string, EnrollStatus>>(() => Object.fromEntries(world.offers.map((o) => [o.course, o.status])));
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const titleOf = (id: string) => world.courses.find((c) => c.id === id)?.title[language] ?? id;

  const items: ListItemView[] = world.offers.map((o) => {
    const status = statuses[o.course];
    const action = status !== 'none' ? '' : o.method === 'code' ? t('enrollment.useCode') : o.method === 'approval' ? t('enrollment.request') : t('enrollment.enroll');
    return {
      id: o.course,
      title: titleOf(o.course),
      detail: status === 'active' ? `✓ ${t('enrollment.active')}` : status === 'pending' ? t('enrollment.pending') : t(`enrollment.${o.method}`),
      status: 'open',
      action,
    };
  });

  const backToList = () => {
    setCodeFor(null);
    setCode('');
    setWrong(false);
    list.current?.focus();
  };

  const onChoose = (index: number) => {
    const offer = world.offers[index];
    const choice = enrollChoice(offer.method, statuses[offer.course]);
    setMessage('');
    if (choice.kind === 'ask-code') {
      setCodeFor(offer.course);
      return;
    }
    if (choice.kind === 'enroll') {
      setStatuses((s) => ({ ...s, [offer.course]: 'active' }));
      setMessage(t('enrollment.done', { course: titleOf(offer.course) }));
    } else if (choice.kind === 'request') {
      setStatuses((s) => ({ ...s, [offer.course]: 'pending' }));
      setMessage(t('enrollment.requested', { course: titleOf(offer.course) }));
    } else {
      setMessage(`${titleOf(offer.course)}: ${t(statuses[offer.course] === 'pending' ? 'enrollment.pending' : 'enrollment.active')}`);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!codeFor) return;
    if (!codeAccepted(code)) {
      setWrong(true);
      return;
    }
    setStatuses((s) => ({ ...s, [codeFor]: 'active' }));
    setMessage(t('enrollment.done', { course: titleOf(codeFor) }));
    backToList();
  };

  return (
    <Modal title={t('buildings.enrollment')} onClose={onClose}>
      <p className="muted">{t('enrollment.intro')}</p>
      <KeyboardList label={t('buildings.enrollment')} items={items} onChoose={onChoose} listRef={list} />
      {codeFor && (
        <form className="code-form" onSubmit={submit}>
          <label htmlFor="enroll-code">{t('enrollment.codeFor', { course: titleOf(codeFor) })}</label>
          <div className="code-row">
            <input
              id="enroll-code"
              autoFocus
              autoComplete="off"
              value={code}
              aria-invalid={wrong || undefined}
              aria-describedby="enroll-code-hint"
              onChange={(e) => {
                setCode(e.target.value);
                setWrong(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  backToList();
                }
              }}
            />
            <button type="submit">{t('enrollment.send')}</button>
          </div>
          <p id="enroll-code-hint" className="muted small">
            {t('enrollment.codeHint', { code: DEMO_CODE })}
          </p>
          {wrong && (
            <p role="alert" className="error">
              {t('enrollment.codeWrong')}
            </p>
          )}
        </form>
      )}
      <p role="status" className="ok" data-testid="enroll-message">
        {message}
      </p>
    </Modal>
  );
}
