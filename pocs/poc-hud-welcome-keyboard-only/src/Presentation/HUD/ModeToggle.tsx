// O seletor Avatar ⇄ Orbital (US20), agora pela tecla M (de "mode"; era C, que passou para o Co-Pilot). Os dois botões
// têm aria-pressed, e o <kbd> M aparece só no modo para onde a tecla leva; a dica embaixo diz o que fazer em cada modo e cita o M. No toque, a dica fala do joystick e do
// arraste, sem teclas.
import { useI18n } from '../i18n/I18n';
import type { NavigationMode } from '../Engine3D/CampusCanvas';
import { HudButton } from './HudButton';

const MODES: NavigationMode[] = ['avatar', 'orbital'];

export function ModeToggle({ mode, onChange, touch }: { mode: NavigationMode; onChange: (m: NavigationMode) => void; touch: boolean }) {
  const { t } = useI18n();
  const hint = `mode.${touch ? 'touch' : 'keys'}.${mode}`;
  return (
    <div className="mode-toggle">
      <div role="group" aria-label={t('mode.label')} className="mode-group">
        {MODES.map((m) => (
          <HudButton key={m} action="mode" touch={touch} pressed={m === mode} hideKey={m === mode} testId={`mode-${m}`} onClick={() => onChange(m)}>
            {t(`mode.${m}`)}
          </HudButton>
        ))}
      </div>
      <span className="mode-hint" data-testid="mode-hint">
        {t(hint)}
      </span>
    </div>
  );
}
