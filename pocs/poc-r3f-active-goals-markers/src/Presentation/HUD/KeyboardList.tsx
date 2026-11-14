// A lista escolhida pelo teclado (US52), no padrão listbox do WAI-ARIA: o foco fica na lista (`aria-activedescendant`
// aponta o item destacado), cada item mostra a tecla dele (`aria-keyshortcuts`) e a página é anunciada. Os atalhos só
// valem com o foco na lista (WCAG 2.1.4): num campo de texto, o número é só texto. Mouse e toque continuam valendo.
import { useId, useState, type KeyboardEvent, type Ref } from 'react';
import { choose, initialActive, moveActive, pageCount, pageOf, pageRange, slotKey, slotOfCode, indexAtSlot, type ItemStatus, type ListKey } from '../../Domain/KeyboardList';
import { useI18n } from '../i18n/I18n';

export interface ListItemView {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly status: ItemStatus;
  /** O que o leitor de tela ouve ao tentar abrir um item bloqueado. */
  readonly lockedSay?: string;
  /** O rótulo da ação à direita (Ir, Matricular-se…); vazio, nenhum. */
  readonly action?: string;
}

const NAV_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

export function KeyboardList({ label, items, onChoose, listRef }: { label: string; items: readonly ListItemView[]; onChoose: (index: number) => void; listRef?: Ref<HTMLUListElement> }) {
  const { t } = useI18n();
  const baseId = useId();
  const statuses = items.map((i) => i.status);
  const [active, setActive] = useState(() => initialActive(statuses));
  const [said, setSaid] = useState('');
  const total = items.length;
  const page = pageOf(active);
  const pages = pageCount(total);
  const { start, end } = pageRange(page, total);
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const pick = (index: number) => {
    setActive(index);
    const choice = choose(index, statuses);
    if (choice.kind === 'blocked') {
      setSaid(items[index].lockedSay ?? '');
      return;
    }
    setSaid('');
    onChoose(index);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || total === 0) return;
    const slot = slotOfCode(e.code);
    if (slot !== null) {
      const index = indexAtSlot(slot, page, total);
      e.preventDefault();
      if (index !== null) pick(index);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
      return;
    }
    if (NAV_KEYS.has(e.key)) {
      e.preventDefault();
      setSaid('');
      setActive(moveActive(active, e.key as ListKey, total));
    }
  };

  if (total === 0) return <p className="muted">{t('list.empty')}</p>;
  return (
    <div className="klist">
      <ul
        ref={listRef}
        role="listbox"
        tabIndex={0}
        data-autofocus
        aria-label={label}
        aria-activedescendant={optionId(active)}
        onKeyDown={onKeyDown}
        className="options"
      >
        {items.slice(start, end).map((item, i) => {
          const index = start + i;
          const key = slotKey(index);
          const locked = item.status === 'locked';
          return (
            <li
              key={item.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              aria-disabled={locked || undefined}
              aria-keyshortcuts={key}
              data-item={item.id}
              className={`option${index === active ? ' active' : ''}${locked ? ' locked' : ''}`}
              onClick={() => pick(index)}
            >
              <kbd className="slot" aria-label={t('list.keyLabel', { key })}>
                {key}
              </kbd>
              <span className="text">
                {item.title}
                {item.detail && <span className="detail">{item.detail}</span>}
              </span>
              {locked ? <span className="lock">🔒</span> : item.action ? <span className="go">{item.action} ›</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="list-foot">
        <span aria-live="polite" data-testid="page">
          {t('list.page', { page: page + 1, pages })}
        </span>
        <span className="keys-hint">{t('list.hint')}</span>
      </p>
      <p className="said" role="status" data-testid="said">
        {said}
      </p>
    </div>
  );
}
