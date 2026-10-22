// Aviso de uma estação dentro da sala (US32): o nome da missão e o botão Usar (o mesmo que a tecla E). Missão já
// concluída mostra o ✓ e não deixa usar de novo.
import { useI18n } from '../i18n/I18n';

export function StationPrompt({ title, done, touch, onUse }: { title: string | null; done: boolean; touch: boolean; onUse: () => void }) {
  const { t } = useI18n();
  return (
    <div className="prompt-region" aria-live="polite">
      {title && (
        <div className="prompt" data-testid="station-prompt">
          <strong>{title}</strong>
          <span>{done ? t('interior.done') : t(touch ? 'interior.promptTouch' : 'interior.prompt')}</span>
          {!done && (
            <div className="prompt-actions">
              <button type="button" onClick={onUse} aria-keyshortcuts="E">
                <kbd>E</kbd> {t('interior.use')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
