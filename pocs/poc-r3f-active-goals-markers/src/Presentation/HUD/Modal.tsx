// Janela modal acessível (o mesmo padrão do HUD do produto): role="dialog" + aria-modal, título por aria-labelledby,
// foco preso (Tab e Shift+Tab circulam), Esc fecha e o foco volta para onde estava. O foco inicial vai para o elemento
// marcado com data-autofocus (aqui, a lista) e não para o "Fechar": é isso que deixa a escolha 100% pelo teclado.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (dialog.current?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            {t('modal.close')} <kbd>Esc</kbd>
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
