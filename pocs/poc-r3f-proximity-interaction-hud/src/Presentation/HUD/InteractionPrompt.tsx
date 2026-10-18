// Aviso de proximidade: aparece quando o avatar entra no raio de um prédio. aria-live anuncia ao leitor de tela.
import { useI18n } from '../i18n/I18n';

export function InteractionPrompt({ buildingLabel }: { buildingLabel: string | null }) {
  const { t } = useI18n();
  return (
    <div className="prompt-region" aria-live="polite">
      {buildingLabel && (
        <div className="prompt" data-testid="interaction-prompt">
          <strong>{buildingLabel}</strong>
          <span>{t('hud.prompt')}</span>
        </div>
      )}
    </div>
  );
}
