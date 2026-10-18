// Sala do prédio (tecla E): por enquanto um painel com o conteúdo e as missões; a cena 3D interna é uma etapa futura.
import type { Building } from '../../Domain/Campus';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

export function BuildingRoomPanel({ building, onClose }: { building: Building; onClose: () => void }) {
  const { t, list } = useI18n();
  return (
    <Modal title={t('rooms.title', { building: t(building.labelKey) })} onClose={onClose} testId="room-panel">
      <p className="muted">{t('rooms.placeholder')}</p>
      <h3>{t('rooms.questsTitle')}</h3>
      <ul>
        {list(`rooms.${building.id}`).map((quest) => (
          <li key={quest}>{quest}</li>
        ))}
      </ul>
    </Modal>
  );
}
