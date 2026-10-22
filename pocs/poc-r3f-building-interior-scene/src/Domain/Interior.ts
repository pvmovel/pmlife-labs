// Domain: o interior de um prédio, orientado a dados (src/Content/interiors.json). TypeScript puro.
//
// A sala é um quadrado com a porta na parede sul (+z), a mesma face do prédio por onde o aluno chega no campus. Cada
// missão é uma ESTAÇÃO (uma mesa, um quadro): um obstáculo com raio de interação. Por isso o interior vira um
// "mini-campus" (interiorAsCampus): o movimento, a colisão, a proximidade, o aviso, a câmera e o joystick do campus
// funcionam lá dentro sem uma linha nova.
import { footprint, type Building, type Campus } from './Campus';
import { DEFAULT_MOVEMENT } from './Movement';

export interface Station {
  readonly id: string;
  /** Chave de tradução do título da missão desta estação. */
  readonly titleKey: string;
  readonly rewardXp: number;
  /** Centro no chão (x, z), em metros, com a origem no centro da sala. */
  readonly position: readonly [number, number];
  /** Largura (x), altura (y) e profundidade (z). */
  readonly size: readonly [number, number, number];
  readonly color: string;
}

export interface Interior {
  readonly buildingId: string;
  /** A sala é um quadrado de lado 2 × halfSize. */
  readonly halfSize: number;
  /** Posição da porta (x) na parede sul. */
  readonly doorX: number;
  readonly stations: readonly Station[];
}

/** Meia largura da porta e distância da parede em que o aluno "sai" (passou pela porta). */
export const DOOR_HALF_WIDTH = 1;
const EXIT_DEPTH = 0.15;
/** Onde o avatar aparece ao entrar: 1,5 m para dentro da porta, olhando para o fundo da sala. */
const ENTRY_DEPTH = 1.5;
/** Raio de interação das estações (a partir da borda da mesa). */
export const STATION_RADIUS = 1.4;
/** Distância da parede sul do prédio em que o avatar aparece ao sair, olhando para fora. */
const EXIT_OFFSET = 1.5;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const tuple = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);

/** Converte e valida o JSON dos interiores contra o campus: conteúdo malformado falha com o campo errado. */
export function toInteriors(raw: unknown, campus: Campus): ReadonlyMap<string, Interior> {
  const list = (raw as { interiors?: unknown }).interiors;
  if (!Array.isArray(list)) throw new Error('interiors: "interiors" precisa ser uma lista');
  const out = new Map<string, Interior>();
  const ids = new Set<string>();
  for (const r of list as Record<string, unknown>[]) {
    const where = `interiors: ${String(r.buildingId)}`;
    if (typeof r.buildingId !== 'string' || !campus.buildings.some((b) => b.id === r.buildingId)) throw new Error(`${where}: prédio inexistente no campus`);
    if (out.has(r.buildingId)) throw new Error(`${where}: interior repetido`);
    if (!isNum(r.halfSize) || r.halfSize < 3 || r.halfSize > 15) throw new Error(`${where}: halfSize precisa estar entre 3 e 15`);
    if (!isNum(r.doorX) || Math.abs(r.doorX) > r.halfSize - DOOR_HALF_WIDTH - 0.5) throw new Error(`${where}: a porta precisa caber na parede sul`);
    if (!Array.isArray(r.stations) || r.stations.length === 0) throw new Error(`${where}: precisa de pelo menos uma estação`);
    const interior: Interior = {
      buildingId: r.buildingId,
      halfSize: r.halfSize,
      doorX: r.doorX,
      stations: (r.stations as Record<string, unknown>[]).map((s, i): Station => {
        const at = `${where}.stations[${i}]`;
        if (typeof s.id !== 'string' || typeof s.titleKey !== 'string' || typeof s.color !== 'string') throw new Error(`${at}: sem id, titleKey ou color`);
        if (ids.has(s.id)) throw new Error(`${at}: id de estação repetido (${s.id})`);
        ids.add(s.id);
        if (!Number.isInteger(s.rewardXp) || (s.rewardXp as number) <= 0) throw new Error(`${at}: rewardXp precisa ser inteiro positivo`);
        if (!tuple(s.position, 2) || !tuple(s.size, 3) || !s.size.every((n) => n > 0)) throw new Error(`${at}: position [x, z] e size [l, a, p] positivos`);
        return { id: s.id, titleKey: s.titleKey, rewardXp: s.rewardXp as number, color: s.color, position: [s.position[0], s.position[1]], size: [s.size[0], s.size[1], s.size[2]] };
      }),
    };
    const problems = interiorProblems(interior, campus);
    if (problems.length) throw new Error(`${where}: ${problems.join('; ')}`);
    out.set(interior.buildingId, interior);
  }
  return out;
}

/** O que impede a sala de funcionar: estação fora das paredes, estações sobrepostas, porta bloqueada, saída ocupada. */
export function interiorProblems(interior: Interior, campus: Campus): string[] {
  const problems: string[] = [];
  const r = DEFAULT_MOVEMENT.radius;
  const room = interiorAsCampus(interior);
  const boxes = room.buildings.map(footprint);
  boxes.forEach((f, i) => {
    const id = interior.stations[i].id;
    if (f.minX < -interior.halfSize || f.maxX > interior.halfSize || f.minZ < -interior.halfSize || f.maxZ > interior.halfSize) problems.push(`${id} sai das paredes`);
    boxes.slice(i + 1).forEach((g, j) => {
      if (f.minX < g.maxX && g.minX < f.maxX && f.minZ < g.maxZ && g.minZ < f.maxZ) problems.push(`${id} sobrepõe ${interior.stations[i + 1 + j].id}`);
    });
    // Do ponto de entrada até a porta precisa haver passagem: nenhuma estação a menos de 1 m do caminho.
    const { x, z } = room.start;
    const nx = Math.max(f.minX - x, 0, x - f.maxX);
    const nz = Math.max(f.minZ - z, 0, z - f.maxZ);
    if (Math.hypot(nx, nz) < r + 1) problems.push(`${id} bloqueia a porta`);
  });
  const building = campus.buildings.find((b) => b.id === interior.buildingId);
  if (building) {
    const out = exitPoint(building);
    const limit = campus.halfSize - r;
    const blocked = campus.buildings.some((b) => {
      const f = footprint(b);
      return out.x + r > f.minX && out.x - r < f.maxX && out.z + r > f.minZ && out.z - r < f.maxZ;
    });
    if (Math.abs(out.x) > limit || Math.abs(out.z) > limit || blocked) problems.push('o ponto diante da porta (do lado de fora) está ocupado ou fora do mapa');
  }
  return problems;
}

/** A sala como um mini-campus: paredes = limite do mapa, estações = obstáculos com raio de interação. */
export function interiorAsCampus(interior: Interior): Campus {
  return {
    halfSize: interior.halfSize,
    start: { x: interior.doorX, z: interior.halfSize - ENTRY_DEPTH, heading: Math.PI },
    buildings: interior.stations.map((s): Building => ({
      id: s.id,
      labelKey: s.titleKey,
      position: s.position,
      size: s.size,
      color: s.color,
      interactionRadius: STATION_RADIUS,
    })),
  };
}

/** O avatar passou pela porta? (encostou na parede sul dentro do vão da porta) */
export function atDoor(x: number, z: number, interior: Interior): boolean {
  const wall = interior.halfSize - DEFAULT_MOVEMENT.radius;
  return Math.abs(x - interior.doorX) <= DOOR_HALF_WIDTH && z >= wall - EXIT_DEPTH;
}

/** Onde o avatar volta ao campus: diante da porta (face sul do prédio), olhando para fora. */
export function exitPoint(building: Building): { x: number; z: number; heading: number } {
  return { x: building.position[0], z: building.position[1] + building.size[2] / 2 + EXIT_OFFSET, heading: 0 };
}
