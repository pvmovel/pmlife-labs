// As edições do mundo, puras (cada uma devolve um mundo novo): mover e ajustar prédios, estações e objetos de parede,
// acrescentar e tirar. O prédio obrigatório não sai da cidade. Tudo anda na grade do editor. A seleção e o caminho dos
// problemas (JSON Pointer) se convertem um no outro, para o editor apontar o item de cada problema.
import { GEOMETRY, snap, type Building, type Interior, type Station, type Wall, type WallItem, type World } from './World';

/** O item selecionado no editor. */
export type Selection =
  | { readonly type: 'spawn' }
  | { readonly type: 'building'; readonly id: string }
  | { readonly type: 'station'; readonly buildingId: string; readonly id: string }
  | { readonly type: 'wallItem'; readonly buildingId: string; readonly id: string };

const clampTo = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** Um id novo com o prefixo, que ainda não existe na lista. */
const nextId = (prefix: string, taken: readonly string[]): string => {
  for (let n = 1; ; n++) if (!taken.includes(`${prefix}-${n}`)) return `${prefix}-${n}`;
};

const mapBuilding = (w: World, id: string, f: (b: Building) => Building): World => ({ ...w, buildings: w.buildings.map((b) => (b.id === id ? f(b) : b)) });
const mapInterior = (w: World, buildingId: string, f: (i: Interior) => Interior): World => ({
  ...w,
  interiors: w.interiors.map((i) => (i.buildingId === buildingId ? f(i) : i)),
});

/**
 * Ajusta campos de um prédio (os números vão para a grade; o tamanho mínimo é a grade).
 *
 * @param world - A cidade.
 * @param id - O prédio.
 * @param patch - Os campos novos.
 * @returns A cidade nova.
 */
export function updateBuilding(world: World, id: string, patch: Partial<Omit<Building, 'id' | 'role'>>): World {
  return mapBuilding(world, id, (b) => {
    const next = { ...b, ...patch };
    return {
      ...next,
      x: snap(next.x),
      z: snap(next.z),
      width: Math.max(GEOMETRY.grid, snap(next.width)),
      depth: Math.max(GEOMETRY.grid, snap(next.depth)),
      height: Math.max(GEOMETRY.grid, snap(next.height)),
    };
  });
}

/** Move um prédio (do arrastar ou das setas do teclado). */
export const moveBuilding = (world: World, id: string, dx: number, dz: number): World => {
  const b = world.buildings.find((x) => x.id === id);
  return b ? updateBuilding(world, id, { x: b.x + dx, z: b.z + dz }) : world;
};

/** Põe o ponto de chegada num lugar (dentro do mapa, na grade). */
export const moveSpawn = (world: World, x: number, z: number): World => ({ ...world, spawn: { x: snap(clampTo(x, world.halfSize)), z: snap(clampTo(z, world.halfSize)) } });

/**
 * Acrescenta um prédio novo no primeiro lugar livre perto do centro.
 *
 * @param world - A cidade.
 * @param label - O nome inicial nos dois idiomas.
 * @returns A cidade nova e o id do prédio.
 */
export function addBuilding(world: World, label: { pt: string; en: string }): { world: World; id: string } {
  const id = nextId('predio', world.buildings.map((b) => b.id));
  const size = 4;
  const free = (x: number, z: number) =>
    Math.abs(x) + size / 2 <= world.halfSize &&
    Math.abs(z) + size / 2 <= world.halfSize &&
    world.buildings.every((b) => Math.abs(b.x - x) >= (b.width + size) / 2 || Math.abs(b.z - z) >= (b.depth + size) / 2);
  let spot = { x: 0, z: 0 };
  search: for (let ring = 0; ring <= world.halfSize; ring += 2) {
    for (let x = -ring; x <= ring; x += 2) {
      for (const z of [-ring, ring]) if (free(x, z)) { spot = { x, z }; break search; }
    }
    for (let z = -ring; z <= ring; z += 2) {
      for (const x of [-ring, ring]) if (free(x, z)) { spot = { x, z }; break search; }
    }
  }
  const b: Building = { id, label, x: spot.x, z: spot.z, width: size, height: 3, depth: size, color: '#64748b' };
  return { world: { ...world, buildings: [...world.buildings, b] }, id };
}

/**
 * Tira um prédio (e o interior dele). O prédio obrigatório (com papel) não sai.
 *
 * @returns A cidade nova, ou `null` se o prédio é obrigatório.
 */
export function removeBuilding(world: World, id: string): World | null {
  const b = world.buildings.find((x) => x.id === id);
  if (!b || b.role) return null;
  return { ...world, buildings: world.buildings.filter((x) => x.id !== id), interiors: world.interiors.filter((i) => i.buildingId !== id) };
}

/** O interior do prédio, criando uma sala padrão se ele ainda não tem. */
export function ensureInterior(world: World, buildingId: string): World {
  if (world.interiors.some((i) => i.buildingId === buildingId)) return world;
  return { ...world, interiors: [...world.interiors, { buildingId, halfSize: 6, doorX: 0, stations: [], wallItems: [] }] };
}

/** Ajusta a sala: o tamanho e a posição da porta. */
export const updateInterior = (world: World, buildingId: string, patch: Partial<Pick<Interior, 'halfSize' | 'doorX'>>): World =>
  mapInterior(world, buildingId, (i) => {
    const next = { ...i, ...patch };
    return { ...next, halfSize: Math.max(GEOMETRY.grid, snap(next.halfSize)), doorX: snap(next.doorX) };
  });

/**
 * Acrescenta uma estação no primeiro lugar livre da sala (fora da faixa da porta e longe das outras).
 *
 * @returns A cidade nova e o id da estação.
 */
export function addStation(world: World, buildingId: string, questId: string): { world: World; id: string } {
  const room = world.interiors.find((i) => i.buildingId === buildingId);
  if (!room) return { world, id: '' };
  const id = nextId('estacao', room.stations.map((s) => s.id));
  const r = GEOMETRY.stationRadius;
  const limit = room.halfSize - r;
  let spot = { x: 0, z: 0 };
  search: for (let z = -limit + 1; z <= limit; z += 1.5) {
    for (let x = -limit + 1; x <= limit; x += 1.5) {
      const nearDoor = Math.abs(x - room.doorX) < GEOMETRY.doorHalfWidth + r && z + r > room.halfSize - GEOMETRY.doorClearance;
      const clear = room.stations.every((s) => Math.hypot(s.x - x, s.z - z) >= 2 * r + GEOMETRY.grid);
      if (!nearDoor && clear) {
        spot = { x: snap(x), z: snap(z) };
        break search;
      }
    }
  }
  const station: Station = { id, x: spot.x, z: spot.z, questId };
  return { world: mapInterior(world, buildingId, (i) => ({ ...i, stations: [...i.stations, station] })), id };
}

/** Ajusta uma estação (a posição vai para a grade). */
export const updateStation = (world: World, buildingId: string, id: string, patch: Partial<Omit<Station, 'id'>>): World =>
  mapInterior(world, buildingId, (i) => ({
    ...i,
    stations: i.stations.map((s) => (s.id !== id ? s : { ...s, ...patch, x: snap(patch.x ?? s.x), z: snap(patch.z ?? s.z) })),
  }));

/** Move uma estação. */
export const moveStation = (world: World, buildingId: string, id: string, dx: number, dz: number): World => {
  const s = world.interiors.find((i) => i.buildingId === buildingId)?.stations.find((x) => x.id === id);
  return s ? updateStation(world, buildingId, id, { x: s.x + dx, z: s.z + dz }) : world;
};

/** Tira uma estação. */
export const removeStation = (world: World, buildingId: string, id: string): World =>
  mapInterior(world, buildingId, (i) => ({ ...i, stations: i.stations.filter((s) => s.id !== id) }));

/**
 * Acrescenta um quadro na parede norte, no primeiro trecho livre.
 *
 * @returns A cidade nova e o id do objeto.
 */
export function addWallItem(world: World, buildingId: string, text: { pt: string; en: string }): { world: World; id: string } {
  const room = world.interiors.find((i) => i.buildingId === buildingId);
  if (!room) return { world, id: '' };
  const id = nextId('quadro', room.wallItems.map((w) => w.id));
  const width = 2;
  let offset = 0;
  for (let o = 0; o <= room.halfSize - width / 2; o += 0.5) {
    const at = [o, -o].find((c) => room.wallItems.every((w) => w.wall !== 'north' || Math.abs(w.offset - c) >= (w.width + width) / 2));
    if (at !== undefined) {
      offset = at;
      break;
    }
  }
  const item: WallItem = { id, wall: 'north', offset, width, kind: 'board', text };
  return { world: mapInterior(world, buildingId, (i) => ({ ...i, wallItems: [...i.wallItems, item] })), id };
}

/** Ajusta um objeto de parede (a posição e a largura vão para a grade). */
export const updateWallItem = (world: World, buildingId: string, id: string, patch: Partial<Omit<WallItem, 'id' | 'kind'>>): World =>
  mapInterior(world, buildingId, (i) => ({
    ...i,
    wallItems: i.wallItems.map((w) => (w.id !== id ? w : { ...w, ...patch, offset: snap(patch.offset ?? w.offset), width: Math.max(GEOMETRY.grid, snap(patch.width ?? w.width)) })),
  }));

/** Desliza um objeto ao longo da parede. */
export const moveWallItem = (world: World, buildingId: string, id: string, delta: number): World => {
  const w = world.interiors.find((i) => i.buildingId === buildingId)?.wallItems.find((x) => x.id === id);
  return w ? updateWallItem(world, buildingId, id, { offset: w.offset + delta }) : world;
};

/** Tira um objeto de parede. */
export const removeWallItem = (world: World, buildingId: string, id: string): World =>
  mapInterior(world, buildingId, (i) => ({ ...i, wallItems: i.wallItems.filter((w) => w.id !== id) }));

/** As paredes, na ordem do seletor. */
export const WALLS: readonly Wall[] = ['north', 'east', 'south', 'west'];

/**
 * O caminho (JSON Pointer) do item selecionado, o mesmo dos problemas do validador.
 *
 * @returns O caminho, ou `null` se o item não existe mais.
 */
export function pathOf(world: World, sel: Selection): string | null {
  if (sel.type === 'spawn') return '/spawn';
  if (sel.type === 'building') {
    const i = world.buildings.findIndex((b) => b.id === sel.id);
    return i < 0 ? null : `/buildings/${i}`;
  }
  const r = world.interiors.findIndex((x) => x.buildingId === sel.buildingId);
  if (r < 0) return null;
  const list = sel.type === 'station' ? world.interiors[r].stations : world.interiors[r].wallItems;
  const i = list.findIndex((x) => x.id === sel.id);
  return i < 0 ? null : `/interiors/${r}/${sel.type === 'station' ? 'stations' : 'wallItems'}/${i}`;
}

/**
 * O item de um caminho do validador (o contrário de {@link pathOf}).
 *
 * @returns A seleção, ou `null` para um caminho da cidade inteira (`/`) ou da sala.
 */
export function selectionAt(world: World, path: string): Selection | null {
  if (path === '/spawn') return { type: 'spawn' };
  const b = /^\/buildings\/(\d+)$/.exec(path);
  if (b) {
    const building = world.buildings[Number(b[1])];
    return building ? { type: 'building', id: building.id } : null;
  }
  const m = /^\/interiors\/(\d+)\/(stations|wallItems)\/(\d+)$/.exec(path);
  if (!m) return null;
  const room = world.interiors[Number(m[1])];
  const item = room?.[m[2] as 'stations' | 'wallItems'][Number(m[3])];
  if (!room || !item) return null;
  return { type: m[2] === 'stations' ? 'station' : 'wallItem', buildingId: room.buildingId, id: item.id };
}

/**
 * O prédio cujo interior um caminho aponta (`/interiors/N...`).
 *
 * @returns O id do prédio, ou `null`.
 */
export function buildingOfPath(world: World, path: string): string | null {
  const m = /^\/interiors\/(\d+)/.exec(path);
  return m ? (world.interiors[Number(m[1])]?.buildingId ?? null) : null;
}
