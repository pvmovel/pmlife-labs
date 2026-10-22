// Painel de missões do prédio. Com sala 3D (US32), é a ALTERNATIVA: a lista de estações com Concluir (leitor de tela,
// quem prefere lista, celular muito lento). Sem sala, continua sendo o jeito de ver as missões do prédio.
import type { Building } from '../../Domain/Campus';
import type { Interior, Station } from '../../Domain/Interior';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

export function BuildingRoomPanel({
  building,
  interior,
  completed,
  onComplete,
  onClose,
}: {
  building: Building;
  interior: Interior | null;
  completed: ReadonlySet<string>;
  onComplete: (station: Station) => void;
  onClose: () => void;
}) {
  const { t, list } = useI18n();
  return (
    <Modal title={t('rooms.title', { building: t(building.labelKey) })} onClose={onClose} testId="room-panel">
      <p className="muted">{t(interior ? 'rooms.alternative' : 'rooms.placeholder')}</p>
      <h3>{t('rooms.questsTitle')}</h3>
      {interior ? (
        <ul className="stations">
          {interior.stations.map((s) => (
            <li key={s.id} data-station={s.id}>
              <span>
                {t(s.titleKey)} <small>+{s.rewardXp} XP</small>
              </span>
              {completed.has(s.id) ? <span className="done">✓ {t('rooms.done')}</span> : <button type="button" onClick={() => onComplete(s)}>{t('rooms.complete')}</button>}
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          {list(`rooms.${building.id}`).map((quest) => (
            <li key={quest}>{quest}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
