// Domain: o mapa por onde o avatar anda (aqui, a sala vira um mini-campus: Room.roomAsCampus), no mesmo formato dos
// prédios do produto, com o raio de interação de cada obstáculo.

export interface Building {
  readonly id: string;
  readonly labelKey: string;
  /** Posição no chão (x, z), em metros. */
  readonly position: readonly [number, number];
  /** Largura (x), altura (y) e profundidade (z). */
  readonly size: readonly [number, number, number];
  readonly color: string;
  /** Distância (em metros, a partir da parede) em que o aviso de interação aparece. Padrão: 3. */
  readonly interactionRadius?: number;
}

export interface Campus {
  /** O mapa é um quadrado de lado 2 × halfSize, centrado na origem. */
  readonly halfSize: number;
  /** Onde o avatar começa e para onde ele olha (radianos; 0 = +z). */
  readonly start: { readonly x: number; readonly z: number; readonly heading: number };
  readonly buildings: readonly Building[];
}

/** Retângulo no chão ocupado por um prédio. */
export interface Footprint {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const footprint = (b: Building): Footprint => ({
  minX: b.position[0] - b.size[0] / 2,
  maxX: b.position[0] + b.size[0] / 2,
  minZ: b.position[1] - b.size[2] / 2,
  maxZ: b.position[1] + b.size[2] / 2,
});
