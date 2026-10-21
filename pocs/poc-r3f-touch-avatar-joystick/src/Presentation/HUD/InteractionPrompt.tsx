// Aviso de interação: aparece quando há um prédio no alcance do avatar (US21) ou selecionado no modo Orbital (US27).
// aria-live anuncia ao leitor de tela. Os botões fazem o mesmo que as teclas E e I: no toque, são o único caminho.
import { useI18n } from '../i18n/I18n';

export interface PromptActions {
  onEnter: () => void;
  onInfo: () => void;
  /** Só no modo Orbital: desfaz a seleção (o mesmo que Esc). */
  onDismiss?: () => void;
}

export function InteractionPrompt({ buildingLabel, hint, actions }: { buildingLabel: string | null; hint: string; actions: PromptActions }) {
  const { t } = useI18n();
  return (
    <div className="prompt-region" aria-live="polite">
      {buildingLabel && (
        <div className="prompt" data-testid="interaction-prompt">
          <div className="prompt-head">
            <strong>{buildingLabel}</strong>
            {actions.onDismiss && (
              <button type="button" className="prompt-dismiss" aria-label={t('hud.dismiss')} onClick={actions.onDismiss}>
                ×
              </button>
            )}
          </div>
          <span>{hint}</span>
          <div className="prompt-actions">
            <button type="button" onClick={actions.onEnter} aria-keyshortcuts="E">
              <kbd>E</kbd> {t('hud.enter')}
            </button>
            <button type="button" onClick={actions.onInfo} aria-keyshortcuts="I">
              <kbd>I</kbd> {t('hud.info')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
