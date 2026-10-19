// A cada quadro, descobre o que está no alcance do avatar (domínio: nearestInteractable, prédios e NPCs) e
// avisa a página só quando isso MUDA: nada de re-render do React a cada quadro.
import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Campus } from '../../Domain/Campus';
import type { AvatarState } from '../../Domain/Movement';
import type { Npc } from '../../Domain/Npc';
import { nearestInteractable, type NearbyTarget } from '../../Domain/Proximity';

/** O que está no alcance, sem a distância (que muda a cada quadro). */
export type Nearby = Pick<NearbyTarget, 'kind' | 'id'>;

export function ProximityTrigger({
  campus,
  npcs,
  stateRef,
  onChange,
}: {
  campus: Campus;
  npcs: readonly Npc[];
  stateRef: MutableRefObject<AvatarState>;
  onChange: (nearby: Nearby | null) => void;
}) {
  const current = useRef<string | null>(null);
  useFrame(() => {
    const { x, z } = stateRef.current;
    const found = nearestInteractable(x, z, campus, npcs);
    const key = found ? `${found.kind}:${found.id}` : null;
    if (key !== current.current) {
      current.current = key;
      onChange(found ? { kind: found.kind, id: found.id } : null);
    }
  });
  return null;
}
