// O painel fixo das metas no canto da cena (US55): as metas fixadas, com "0 de 2" ou "cumprida" e os prédios que
// faltam; numa fase sem metas do autor, o próximo passo sugerido. aria-live anuncia a mudança ao leitor de tela.
import type { Building } from '../../Domain/Campus';
import type { GoalHud } from '../../Domain/Goals';
import { useI18n } from '../i18n/I18n';

export function GoalsHud({ hud, buildings, onOpen, touch }: { hud: GoalHud; buildings: readonly Building[]; onOpen: () => void; touch: boolean }) {
  const { t } = useI18n();
  const nameOf = (id: string) => t(buildings.find((b) => b.id === id)?.labelKey ?? id);
  return (
    <aside className="goals-hud" data-testid="goals-hud" aria-live="polite">
      <div className="goals-hud-head">
        <strong>{t(hud.kind === 'goals' ? 'hud.goalsTitle' : 'hud.suggestionTitle')}</strong>
        <button type="button" onClick={onOpen} aria-keyshortcuts="G" data-testid="open-goals">
          {t('hud.goals')} {!touch && <kbd>G</kbd>}
        </button>
      </div>
      {hud.kind === 'suggestion' ? (
        <p data-testid="suggestion">{hud.quest ? t('hud.suggestion', { quest: t(hud.quest.titleKey), building: nameOf(hud.quest.buildingId) }) : t('hud.phaseDone')}</p>
      ) : hud.pinned.length === 0 ? (
        <p className="goals-empty">{t('hud.noPins')}</p>
      ) : (
        <ul className="goals-list">
          {hud.pinned.map((p) => {
            const where = [...new Set(p.pending.map((q) => nameOf(q.buildingId)))].join(', ');
            return (
              <li key={p.goal.id} data-goal={p.goal.id} data-status={p.status} className={p.status === 'concluded' ? 'met' : undefined}>
                <span className="goal-title">{t(p.goal.titleKey)}</span>
                <span className="goal-progress" data-testid={`progress-${p.goal.id}`}>
                  {p.status === 'concluded' ? `✓ ${t('hud.concluded')}` : t('hud.progress', { done: p.done, total: p.total })}
                </span>
                {where && <span className="goal-where">{t('hud.where', { buildings: where })}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
