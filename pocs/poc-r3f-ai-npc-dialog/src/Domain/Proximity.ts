// Domain: o que está perto o bastante para interagir (prédio ou NPC). TypeScript puro.
//
// A distância é medida até a PAREDE do prédio (o retângulo no chão), não até o centro: com prédios de
// tamanhos diferentes, "3 metros do centro" seria dentro de um prédio grande e longe de um pequeno.
// Para um NPC, a distância é até o corpo dele.
import { footprint, type Building, type Campus } from './Campus';
import { NPC_BODY_RADIUS, type Npc } from './Npc';

/** Raio padrão de interação com prédios, em metros a partir da parede (US21: "a menos de 3 unidades"). */
export const DEFAULT_INTERACTION_RADIUS = 3;
/** Raio padrão de conversa com NPCs, em metros a partir do corpo: é preciso chegar mais perto de uma pessoa. */
export const DEFAULT_NPC_RADIUS = 2;

/** Distância de um ponto do chão até a parede mais próxima do prédio (0 se estiver dentro). */
export function distanceToBuilding(x: number, z: number, b: Building): number {
  const f = footprint(b);
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

/** Distância de um ponto do chão até o corpo do NPC (0 se encostar). */
export function distanceToNpc(x: number, z: number, n: Npc): number {
  return Math.max(0, Math.hypot(x - n.position[0], z - n.position[1]) - NPC_BODY_RADIUS);
}

/** O que está no alcance: um prédio (I/E) ou um NPC (E para conversar). */
export interface NearbyTarget {
  readonly kind: 'building' | 'npc';
  readonly id: string;
  readonly distance: number;
}

/**
 * O prédio ou NPC mais próximo cujo raio de interação alcança o avatar, ou `null`.
 * Com dois no alcance, vence o mais perto (o aviso nunca fica ambíguo).
 */
export function nearestInteractable(x: number, z: number, campus: Campus, npcs: readonly Npc[] = []): NearbyTarget | null {
  let best: NearbyTarget | null = null;
  const consider = (kind: NearbyTarget['kind'], id: string, distance: number, radius: number) => {
    if (distance <= radius && (!best || distance < best.distance)) best = { kind, id, distance };
  };
  for (const b of campus.buildings) consider('building', b.id, distanceToBuilding(x, z, b), b.interactionRadius ?? DEFAULT_INTERACTION_RADIUS);
  for (const n of npcs) consider('npc', n.id, distanceToNpc(x, z, n), n.interactionRadius ?? DEFAULT_NPC_RADIUS);
  return best;
}
