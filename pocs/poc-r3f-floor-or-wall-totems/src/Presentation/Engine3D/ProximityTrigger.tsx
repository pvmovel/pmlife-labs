// A cada quadro, descobre qual prédio está no alcance do avatar (domínio: nearestInteractable) e avisa a
// página só quando ele MUDA: nada de re-render do React a cada quadro.
import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Campus } from '../../Domain/Campus';
import type { AvatarState } from '../../Domain/Movement';
import { nearestInteractable } from '../../Domain/Proximity';

export function ProximityTrigger({
  campus,
  stateRef,
  onChange,
}: {
  campus: Campus;
  stateRef: MutableRefObject<AvatarState>;
  onChange: (buildingId: string | null) => void;
}) {
  const current = useRef<string | null>(null);
  useFrame(() => {
    const { x, z } = stateRef.current;
    const id = nearestInteractable(x, z, campus)?.building.id ?? null;
    if (id !== current.current) {
      current.current = id;
      onChange(id);
    }
  });
  return null;
}
