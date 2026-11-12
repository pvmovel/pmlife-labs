// Os dois portais (US52): no dos cursos, os cursos do aluno; no das fases, as fases do curso, com o estado. Escolher
// fecha a janela e leva ao lugar; a fase bloqueada não abre e diz o motivo.
import type { World } from '../world';
import { useI18n } from '../i18n/I18n';
import { KeyboardList, type ListItemView } from './KeyboardList';
import { Modal } from './Modal';

export function PortalModal({ kind, world, onGo, onClose }: { kind: 'courses-portal' | 'phases-portal'; world: World; onGo: (place: string) => void; onClose: () => void }) {
  const { t, language } = useI18n();
  const courseTitle = (id: string) => world.courses.find((c) => c.id === id)?.title[language] ?? id;
  const phaseTitle = (id: string) => world.phases.find((p) => p.id === id)?.title[language] ?? id;

  const items: ListItemView[] =
    kind === 'courses-portal'
      ? world.courses.map((c) => ({ id: c.id, title: c.title[language], status: 'open', action: t('list.go') }))
      : world.phases.map((p) => ({
          id: p.id,
          title: p.title[language],
          status: p.status,
          detail: p.status === 'locked' && p.requires ? t('list.locked', { phase: phaseTitle(p.requires) }) : t(`status.${p.status}`),
          lockedSay: p.requires ? t('list.lockedSay', { item: p.title[language], phase: phaseTitle(p.requires) }) : undefined,
          action: t('list.go'),
        }));

  const title = t(`buildings.${kind}`);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{kind === 'courses-portal' ? t('portal.coursesIntro') : t('portal.phasesIntro', { course: courseTitle(world.phasesCourse) })}</p>
      <KeyboardList
        label={title}
        items={items}
        onChoose={(index) => {
          onClose();
          onGo(items[index].title);
        }}
      />
    </Modal>
  );
}
