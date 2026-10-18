// Domain: o mapa por onde o avatar anda. É dado (src/Content/campus.json), no mesmo formato dos prédios da US19.

export interface Building {
  readonly id: string;
  readonly labelKey: string;
  /** Posição no chão (x, z), em metros. */
  readonly position: readonly [number, number];
  /** Largura (x), altura (y) e profundidade (z). */
  readonly size: readonly [number, number, number];
  readonly color: string;
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

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const tuple = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);

/**
 * Converte o JSON do conteúdo em Campus, conferindo o formato (o TypeScript não sabe que
 * "position" tem 2 números). Conteúdo malformado falha com a mensagem do campo errado.
 */
export function toCampus(raw: unknown): Campus {
  const c = raw as { halfSize?: unknown; start?: { x?: unknown; z?: unknown; heading?: unknown }; buildings?: unknown };
  if (!isNum(c.halfSize) || c.halfSize <= 0) throw new Error('campus: halfSize precisa ser positivo');
  if (!c.start || !isNum(c.start.x) || !isNum(c.start.z) || !isNum(c.start.heading)) throw new Error('campus: start inválido');
  if (!Array.isArray(c.buildings)) throw new Error('campus: buildings precisa ser uma lista');
  const buildings = c.buildings.map((b: Record<string, unknown>, i: number): Building => {
    if (typeof b.id !== 'string' || typeof b.labelKey !== 'string' || typeof b.color !== 'string') throw new Error(`campus: prédio ${i} sem id, labelKey ou color`);
    if (!tuple(b.position, 2)) throw new Error(`campus: ${b.id}.position precisa ser [x, z]`);
    if (!tuple(b.size, 3) || !b.size.every((n) => n > 0)) throw new Error(`campus: ${b.id}.size precisa ser [largura, altura, profundidade] positivos`);
    return { id: b.id, labelKey: b.labelKey, color: b.color, position: [b.position[0], b.position[1]], size: [b.size[0], b.size[1], b.size[2]] };
  });
  return { halfSize: c.halfSize, start: { x: c.start.x, z: c.start.z, heading: c.start.heading }, buildings };
}
