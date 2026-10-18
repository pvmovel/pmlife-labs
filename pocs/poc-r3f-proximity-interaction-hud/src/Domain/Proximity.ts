// Domain: qual prédio está perto o bastante para interagir. TypeScript puro.
//
// A distância é medida até a PAREDE do prédio (o retângulo no chão), não até o centro: com prédios de
// tamanhos diferentes, "3 metros do centro" seria dentro de um prédio grande e longe de um pequeno.
import { footprint, type Building, type Campus } from './Campus';

/** Raio padrão de interação, em metros a partir da parede (Gherkin: "a menos de 3 unidades"). */
export const DEFAULT_INTERACTION_RADIUS = 3;

/** Distância de um ponto do chão até a parede mais próxima do prédio (0 se estiver dentro). */
export function distanceToBuilding(x: number, z: number, b: Building): number {
  const f = footprint(b);
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

export interface NearbyBuilding {
  readonly building: Building;
  readonly distance: number;
}

/**
 * O prédio mais próximo cujo raio de interação alcança o avatar, ou `null`.
 * Com dois prédios no alcance, vence o mais perto (o aviso nunca fica ambíguo).
 */
export function nearestInteractable(x: number, z: number, campus: Campus): NearbyBuilding | null {
  let best: NearbyBuilding | null = null;
  for (const building of campus.buildings) {
    const distance = distanceToBuilding(x, z, building);
    if (distance > (building.interactionRadius ?? DEFAULT_INTERACTION_RADIUS)) continue;
    if (!best || distance < best.distance) best = { building, distance };
  }
  return best;
}
