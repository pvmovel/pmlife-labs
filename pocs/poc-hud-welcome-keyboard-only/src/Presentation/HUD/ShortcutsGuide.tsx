// A janela de boas-vindas (primeira visita) e a ajuda (H) são a mesma tela, lida da lista única de atalhos: o que a
// boas-vindas ensina é exatamente o que o teclado faz. No toque, ela fala do joystick e dos botões, sem teclas.
import { grouped } from '../../Domain/Shortcuts';
import { useI18n } from '../i18n/I18n';
import { SHORTCUTS } from '../shortcutMap';
import { Modal } from './Modal';

export function ShortcutsGuide({ variant, touch, onClose }: { variant: 'welcome' | 'help'; touch: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const welcome = variant === 'welcome';
  return (
    <Modal title={t(welcome ? 'guide.welcomeTitle' : 'guide.helpTitle')} onClose={onClose} testId={welcome ? 'welcome' : 'help'}>
      {welcome && <p className="guide-intro">{t(touch ? 'guide.welcomeIntroTouch' : 'guide.welcomeIntro')}</p>}
      {touch ? (
        <ul className="guide-touch">
          <li>{t('guide.touch.move')}</li>
          <li>{t('guide.touch.buttons')}</li>
          <li>{t('guide.touch.mode')}</li>
        </ul>
      ) : (
        grouped(SHORTCUTS).map(({ group, items }) => (
          <section key={group} className="guide-group">
            <h3>{t(`guide.groups.${group}`)}</h3>
            <dl className="guide-list">
              {items.map((s) => (
                <div key={s.id} className="guide-row" data-shortcut={s.id}>
                  <dt>
                    {s.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{t(s.labelKey)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
      <p className="guide-foot">{t(touch ? 'guide.footTouch' : 'guide.foot')}</p>
      {welcome && (
        <button type="button" className="primary" data-autofocus data-testid="welcome-start" onClick={onClose}>
          {t('guide.start')}
        </button>
      )}
    </Modal>
  );
}
