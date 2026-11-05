// A validação do mundo (a mesma regra que o servidor confere antes de publicar): o que não passa não é publicado, e a
// lista de problemas aponta cada item por um caminho estável (JSON Pointer), que o editor usa para selecioná-lo.
import { GEOMETRY, REQUIRED_ROLES, type Building, type Interior, type World } from './World';

/** Um problema do mundo: um código estável (a tela traduz), o item e, se for o caso, um detalhe. */
export interface Problem {
  readonly code:
    | 'OUT_OF_MAP'
    | 'BUILDINGS_OVERLAP'
    | 'SPAWN_INSIDE_BUILDING'
    | 'SPAWN_OUT_OF_MAP'
    | 'ROLE_MISSING'
    | 'TEXT_EMPTY'
    | 'COLOR_INVALID'
    | 'SIZE_INVALID'
    | 'ROOM_SIZE_INVALID'
    | 'DOOR_OUTSIDE'
    | 'STATION_OUTSIDE_WALLS'
    | 'STATION_BLOCKS_DOOR'
    | 'STATIONS_OVERLAP'
    | 'STATION_QUEST_UNKNOWN'
    | 'WALL_ITEM_OUTSIDE'
    | 'WALL_ITEM_ON_DOOR'
    | 'WALL_ITEMS_OVERLAP';
  /** O item: `/buildings/2`, `/interiors/0/stations/1`, `/interiors/0/wallItems/0`, `/spawn` ou `/` (a cidade). */
  readonly path: string;
  /** O outro item envolvido (sobreposição) ou o papel que falta. */
  readonly param?: string;
}

const COLOR = /^#[0-9a-f]{6}$/i;

/** O retângulo de um prédio no chão: [oeste, leste, norte, sul]. */
const footprint = (b: Building): [number, number, number, number] => [b.x - b.width / 2, b.x + b.width / 2, b.z - b.depth / 2, b.z + b.depth / 2];

const overlaps = (a: Building, b: Building): boolean => {
  const [aw, ae, an, as] = footprint(a);
  const [bw, be, bn, bs] = footprint(b);
  return aw < be && bw < ae && an < bs && bn < as;
};

/**
 * Confere uma cidade e os interiores dela.
 *
 * @param world - A cidade.
 * @returns Os problemas, na ordem dos itens; vazio quando ela pode ser publicada.
 */
export function validateWorld(world: World): Problem[] {
  const problems: Problem[] = [];
  const H = world.halfSize;
  world.buildings.forEach((b, i) => {
    const path = `/buildings/${i}`;
    const [w, e, n, s] = footprint(b);
    if (!b.label.pt.trim() || !b.label.en.trim()) problems.push({ code: 'TEXT_EMPTY', path });
    if (!COLOR.test(b.color)) problems.push({ code: 'COLOR_INVALID', path });
    if (b.width <= 0 || b.depth <= 0 || b.height <= 0) problems.push({ code: 'SIZE_INVALID', path });
    if (w < -H || e > H || n < -H || s > H) problems.push({ code: 'OUT_OF_MAP', path });
    world.buildings.forEach((other, j) => {
      if (j > i && overlaps(b, other)) problems.push({ code: 'BUILDINGS_OVERLAP', path, param: `/buildings/${j}` });
    });
  });
  const { x, z } = world.spawn;
  if (Math.abs(x) > H || Math.abs(z) > H) problems.push({ code: 'SPAWN_OUT_OF_MAP', path: '/spawn' });
  const inside = world.buildings.findIndex((b) => {
    const [w, e, n, s] = footprint(b);
    return x > w && x < e && z > n && z < s;
  });
  if (inside >= 0) problems.push({ code: 'SPAWN_INSIDE_BUILDING', path: '/spawn', param: `/buildings/${inside}` });
  for (const role of REQUIRED_ROLES[world.kind]) {
    if (!world.buildings.some((b) => b.role === role)) problems.push({ code: 'ROLE_MISSING', path: '/', param: role });
  }
  world.interiors.forEach((interior, i) => problems.push(...validateInterior(world, interior, `/interiors/${i}`)));
  return problems;
}

function validateInterior(world: World, room: Interior, base: string): Problem[] {
  const problems: Problem[] = [];
  const H = room.halfSize;
  const { stationRadius: r, doorHalfWidth, doorClearance } = GEOMETRY;
  if (H < GEOMETRY.minRoom || H > GEOMETRY.maxRoom) problems.push({ code: 'ROOM_SIZE_INVALID', path: base });
  if (Math.abs(room.doorX) + doorHalfWidth > H) problems.push({ code: 'DOOR_OUTSIDE', path: base });
  const quests = new Set(world.quests.filter((q) => q.buildingId === room.buildingId).map((q) => q.id));
  room.stations.forEach((st, i) => {
    const path = `${base}/stations/${i}`;
    if (Math.abs(st.x) + r > H || Math.abs(st.z) + r > H) problems.push({ code: 'STATION_OUTSIDE_WALLS', path });
    // A faixa na frente da porta fica livre: a largura da porta (mais o raio) e a profundidade de entrada.
    else if (Math.abs(st.x - room.doorX) < doorHalfWidth + r && st.z + r > H - doorClearance) problems.push({ code: 'STATION_BLOCKS_DOOR', path });
    if (!quests.has(st.questId)) problems.push({ code: 'STATION_QUEST_UNKNOWN', path, param: st.questId });
    room.stations.forEach((other, j) => {
      if (j > i && Math.hypot(st.x - other.x, st.z - other.z) < 2 * r) problems.push({ code: 'STATIONS_OVERLAP', path, param: `${base}/stations/${j}` });
    });
  });
  room.wallItems.forEach((item, i) => {
    const path = `${base}/wallItems/${i}`;
    if (Math.abs(item.offset) + item.width / 2 > H || item.width <= 0) problems.push({ code: 'WALL_ITEM_OUTSIDE', path });
    if (item.wall === 'south' && Math.abs(item.offset - room.doorX) < doorHalfWidth + item.width / 2) problems.push({ code: 'WALL_ITEM_ON_DOOR', path });
    if (!item.text.pt.trim() || !item.text.en.trim()) problems.push({ code: 'TEXT_EMPTY', path });
    room.wallItems.forEach((other, j) => {
      if (j > i && other.wall === item.wall && Math.abs(item.offset - other.offset) < (item.width + other.width) / 2) {
        problems.push({ code: 'WALL_ITEMS_OVERLAP', path, param: `${base}/wallItems/${j}` });
      }
    });
  });
  return problems;
}
