import type { Building } from '../../Domain/Campus';
import { useI18n } from '../i18n/I18n';
import { Modal } from './Modal';

export function BuildingInfoModal({ building, onClose }: { building: Building; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t('info.title', { building: t(building.labelKey) })} onClose={onClose} testId="info-modal">
      <p>{t(`info.${building.id}`)}</p>
    </Modal>
  );
}
