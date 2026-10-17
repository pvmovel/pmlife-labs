// Domain: a cidade de uma trilha é dado. O motor só garante que o dado é coerente antes de desenhar.

/** Um prédio do campus: onde fica, o tamanho, a cor e a chave de tradução do rótulo. */
export interface Building {
  readonly id: string;
  readonly labelKey: string;
  /** Posição no chão (x, z), em metros; o prédio nasce no chão (y = 0). */
  readonly position: readonly [number, number];
  /** Largura (x), altura (y) e profundidade (z). */
  readonly size: readonly [number, number, number];
  /** Cor no formato #rrggbb. */
  readonly color: string;
}

export interface CityDefinition {
  readonly trackId: string;
  readonly labelKey: string;
  readonly buildings: readonly Building[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Pegada no chão (retângulo em x/z) de um prédio. */
const footprint = (b: Building) => ({
  minX: b.position[0] - b.size[0] / 2,
  maxX: b.position[0] + b.size[0] / 2,
  minZ: b.position[1] - b.size[2] / 2,
  maxZ: b.position[1] + b.size[2] / 2,
});

/**
 * Valida uma cidade e devolve a lista de problemas (vazia = válida).
 * Prédio novo com erro de digitação ou em cima de outro é recusado antes de chegar à cena.
 */
export function validateCity(city: CityDefinition): string[] {
  const errors: string[] = [];
  if (!city.trackId.trim()) errors.push('trackId vazio');
  if (city.buildings.length === 0) errors.push('a cidade não tem prédios');

  const ids = new Set<string>();
  for (const b of city.buildings) {
    if (ids.has(b.id)) errors.push(`id repetido: ${b.id}`);
    ids.add(b.id);
    if (!b.labelKey.trim()) errors.push(`${b.id}: labelKey vazia`);
    if (!b.position.every(Number.isFinite)) errors.push(`${b.id}: posição inválida`);
    if (!b.size.every((n) => Number.isFinite(n) && n > 0)) errors.push(`${b.id}: dimensões precisam ser positivas`);
    if (!HEX.test(b.color)) errors.push(`${b.id}: cor "${b.color}" fora do formato #rrggbb`);
  }

  for (let i = 0; i < city.buildings.length; i++) {
    for (let j = i + 1; j < city.buildings.length; j++) {
      const a = footprint(city.buildings[i]);
      const b = footprint(city.buildings[j]);
      if (a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ) {
        errors.push(`${city.buildings[i].id} e ${city.buildings[j].id} se sobrepõem`);
      }
    }
  }
  return errors;
}
