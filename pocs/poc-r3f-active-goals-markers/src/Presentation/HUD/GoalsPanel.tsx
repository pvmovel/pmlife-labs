// A janela das metas (US55): as metas do autor na lista pelo teclado da US52 (1 a 9 e 0, setas, Enter, clique e toque).
// Escolher uma meta fixa ou desafixa; o resultado é anunciado. Numa fase sem metas, a janela explica a sugestão.
import { useState } from 'react';
import type { Building } from '../../Domain/Campus';
import { goalProgress, type Phase } from '../../Domain/Goals';
import { useI18n } from '../i18n/I18n';
import { KeyboardList, type ListItemView } from './KeyboardList';
import { Modal } from './Modal';

export function GoalsPanel({
  phase,
  buildings,
  completed,
  pinned,
  onToggle,
  onClose,
}: {
  phase: Phase;
  buildings: readonly Building[];
  completed: ReadonlySet<string>;
  pinned: readonly string[];
  onToggle: (goalId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [said, setSaid] = useState('');
  const goals = phase.goals ?? [];
  const nameOf = (id: string) => t(buildings.find((b) => b.id === id)?.labelKey ?? id);
  const items: ListItemView[] = goals.map((g) => {
    const p = goalProgress(g, phase, completed);
    const isPinned = pinned.includes(g.id);
    const where = [...new Set(g.quests.map((id) => phase.quests.find((q) => q.id === id)?.buildingId ?? id))].map(nameOf).join(', ');
    return {
      id: g.id,
      title: isPinned ? `${t(g.titleKey)} · ${t('panel.pinned')}` : t(g.titleKey),
      detail: t('panel.detail', { progress: p.status === 'concluded' ? t('hud.concluded') : t('hud.progress', { done: p.done, total: p.total }), buildings: where }),
      status: p.status,
      action: t(isPinned ? 'panel.unpin' : 'panel.pin'),
    };
  });
  const choose = (index: number) => {
    const g = goals[index];
    const willPin = !pinned.includes(g.id);
    onToggle(g.id);
    setSaid(t(willPin ? 'panel.pinnedSay' : 'panel.unpinnedSay', { goal: t(g.titleKey) }));
  };
  return (
    <Modal title={t('panel.title')} onClose={onClose} testId="goals-panel">
      {goals.length === 0 ? (
        <p>{t('panel.noGoalsIntro')}</p>
      ) : (
        <>
          <p className="muted">{t('panel.intro')}</p>
          <KeyboardList label={t('panel.label')} items={items} onChoose={choose} />
          <p className="said-pin" role="status" data-testid="pin-said">
            {said}
          </p>
        </>
      )}
    </Modal>
  );
}
