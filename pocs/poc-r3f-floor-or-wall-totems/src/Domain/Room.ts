// Domain: a sala com objetos na parede OU no chão (US75), no formato do documento do produto. Todo objeto (o quadro de
// texto e o totem de vídeo, e no produto as ferramentas que vêm) ganha um campo opcional `placement`: sem ele, vale
// "wall", e os documentos de antes continuam iguais. Na parede: a parede, o centro ao longo dela e a largura; no chão:
// o centro (x, z), para onde a frente olha e a largura. TypeScript puro.
import type { Building, Campus } from './Campus';
import { DEFAULT_MOVEMENT } from './Movement';
import { VIDEO_ID } from './YouTube';

export const WALLS = ['north', 'east', 'south', 'west'] as const;
/** Uma parede da sala (a porta fica sempre na sul, +z). No chão, é também para onde a frente do objeto olha. */
export type Wall = (typeof WALLS)[number];
export type Placement = 'wall' | 'floor';
export type ItemKind = 'board' | 'totem';

/** Um objeto da sala: o quadro de texto (no chão, a placa de aviso) ou o totem de vídeo. */
export interface RoomItem {
  readonly id: string;
  readonly kind: ItemKind;
  /** O texto do quadro, ou o título do totem. */
  readonly textKey: string;
  /** Largura, em metros (na parede, o espaço que ocupa nela). */
  readonly width: number;
  /** Sem o campo, vale "wall": o documento de antes continua igual. */
  readonly placement?: Placement;
  /** Na parede: qual. */
  readonly wall?: Wall;
  /** Na parede: o centro ao longo dela (de oeste para leste no norte e no sul; de norte para sul no leste e no oeste). */
  readonly offset?: number;
  /** No chão: o centro. */
  readonly x?: number;
  readonly z?: number;
  /** No chão: para onde a frente olha. */
  readonly facing?: Wall;
  /** Totem: o ID do vídeo (11 caracteres), nunca o link. */
  readonly videoId?: string;
}

/** Uma estação da sala (a mesa de uma missão): é obstáculo e alvo, como no produto. */
export interface Station {
  readonly id: string;
  readonly labelKey: string;
  readonly position: readonly [number, number];
  readonly size: readonly [number, number, number];
}

/** A sala: um quadrado com a porta na parede sul (+z). */
export interface Room {
  readonly halfSize: number;
  readonly doorX: number;
  readonly stations: readonly Station[];
  readonly items: readonly RoomItem[];
}

/** Meia largura do vão da porta. */
export const DOOR_HALF_WIDTH = 1;
/** Espessura das paredes. */
export const WALL_THICKNESS = 0.2;
/** Profundidade do totem de parede (a moldura com a tela). */
export const TOTEM_DEPTH = 0.25;
/** Profundidade de um objeto no chão (o pedestal): ocupa largura × 0,5 m. */
export const FLOOR_DEPTH = 0.5;
/** Distância (a partir da borda) em que o aviso do totem aparece. */
export const TOTEM_RADIUS = 1.6;
/** Distância (a partir da borda) em que o aviso da estação aparece. */
export const STATION_RADIUS = 1.4;
/** Até 5 quadros por parede, somando quadros de texto e totens (decisão do Pablo, 2026-11-14). O chão não conta. */
export const WALL_ITEMS_PER_WALL = 5;
/** O teto de objetos por sala, como no produto. */
export const ITEMS_PER_ROOM = 20;
/** Raio de quem é só obstáculo: nenhuma distância o alcança. */
const OBSTACLE_ONLY = -1;
/** Onde o avatar aparece ao entrar: 1,5 m para dentro da porta. */
export const ENTRY_DEPTH = 1.5;
/** A sala nova (US75): meio lado 9 (paredes de 18 m) e a porta perto do canto, para a parede sul também caber 5 quadros. */
export const NEW_ROOM = { halfSize: 9, doorX: -6.5 } as const;

export const placementOf = (item: RoomItem): Placement => item.placement ?? 'wall';

/** Onde um objeto de parede fica: o centro na face de dentro da parede, afastado `inset`, e a rotação para o centro. */
export function wallAnchor(halfSize: number, wall: Wall, offset: number, inset = 0): { x: number; z: number; rotationY: number; horizontal: boolean } {
  const d = halfSize - inset;
  if (wall === 'north') return { x: offset, z: -d, rotationY: 0, horizontal: true };
  if (wall === 'south') return { x: offset, z: d, rotationY: Math.PI, horizontal: true };
  if (wall === 'east') return { x: d, z: offset, rotationY: -Math.PI / 2, horizontal: false };
  return { x: -d, z: offset, rotationY: Math.PI / 2, horizontal: false };
}

/** A rotação de um objeto no chão: a frente (+z do modelo) olha para `facing`. */
export function facingRotation(facing: Wall): number {
  if (facing === 'south') return 0;
  if (facing === 'north') return Math.PI;
  if (facing === 'east') return Math.PI / 2;
  return -Math.PI / 2;
}

/** Um retângulo no chão. */
export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const boxAt = (x: number, z: number, sx: number, sz: number): Box => ({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });

/** O que um objeto no chão ocupa: a largura na direção de lado e 0,5 m na direção da frente. */
export function floorBox(item: RoomItem): Box {
  const across = item.facing === 'east' || item.facing === 'west';
  return boxAt(item.x ?? 0, item.z ?? 0, across ? FLOOR_DEPTH : item.width, across ? item.width : FLOOR_DEPTH);
}

/** O que um totem de parede ocupa no chão (um obstáculo fino encostado na parede). */
function wallTotemBox(halfSize: number, item: RoomItem): Box {
  const a = wallAnchor(halfSize, item.wall ?? 'north', item.offset ?? 0, WALL_THICKNESS / 2 + TOTEM_DEPTH / 2);
  return a.horizontal ? boxAt(a.x, a.z, item.width, TOTEM_DEPTH) : boxAt(a.x, a.z, TOTEM_DEPTH, item.width);
}

const stationBox = (s: Station): Box => boxAt(s.position[0], s.position[1], s.size[0], s.size[2]);
const overlaps = (a: Box, b: Box): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const distanceTo = (b: Box, x: number, z: number): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

/** O corredor da porta: do vão até onde o avatar aparece ao entrar, com a largura do avatar e uma folga. */
export function doorCorridor(room: Room): Box {
  const r = DEFAULT_MOVEMENT.radius;
  const zFrom = room.halfSize - ENTRY_DEPTH - r - 0.5;
  return { minX: room.doorX - DOOR_HALF_WIDTH, maxX: room.doorX + DOOR_HALF_WIDTH, minZ: zFrom, maxZ: room.halfSize };
}

export type ProblemCode =
  | 'ID_DUPLICATE'
  | 'ITEMS_TOO_MANY'
  | 'SIZE_NOT_POSITIVE'
  | 'VIDEO_ID_INVALID'
  | 'WALL_ITEM_OUTSIDE'
  | 'WALL_ITEM_ON_DOOR'
  | 'WALL_ITEMS_OVERLAP'
  | 'WALL_ITEMS_TOO_MANY'
  | 'FLOOR_ITEM_OUTSIDE'
  | 'FLOOR_ITEM_BLOCKS_DOOR'
  | 'FLOOR_ITEMS_OVERLAP'
  | 'FLOOR_ITEM_BLOCKS_PATH';

/** Um problema da sala: código estável (a tela traduz), o objeto apontado e, quando ajuda, a parede ou o alvo. */
export interface RoomProblem {
  readonly code: ProblemCode;
  readonly itemId: string;
  /** WALL_ITEMS_TOO_MANY: a parede cheia. */
  readonly wall?: Wall;
  /** FLOOR_ITEM_BLOCKS_PATH: a estação ou o totem que ficou sem passagem. */
  readonly target?: string;
}

/** Um alvo da sala (o que o aluno precisa alcançar): as estações e os totens. */
interface Target {
  readonly id: string;
  readonly box: Box;
  readonly radius: number;
}

function targets(room: Room): Target[] {
  return [
    ...room.stations.map((s) => ({ id: s.id, box: stationBox(s), radius: STATION_RADIUS })),
    ...room.items.filter((i) => i.kind === 'totem').map((i) => ({ id: i.id, box: placementOf(i) === 'floor' ? floorBox(i) : wallTotemBox(room.halfSize, i), radius: TOTEM_RADIUS })),
  ];
}

/** Tamanho da célula da grade da passagem livre, em metros. */
const CELL = 0.25;

/**
 * Os alvos que o avatar alcança a partir da porta, andando pela grade (busca em largura), com a mesma colisão do
 * movimento: o avatar é uma caixa de lado 2·raio e não atravessa os obstáculos nem as paredes.
 *
 * @param room - A sala.
 * @param obstacles - O que bloqueia o caminho.
 * @returns Os ids dos alvos alcançados.
 */
export function reachable(room: Room, obstacles: readonly Box[]): Set<string> {
  const r = DEFAULT_MOVEMENT.radius;
  const limit = room.halfSize - r;
  const n = Math.floor((2 * limit) / CELL) + 1;
  const coord = (i: number) => -limit + i * CELL;
  const free = (x: number, z: number) => !obstacles.some((o) => overlaps(boxAt(x, z, 2 * r, 2 * r), o));
  const seen = new Uint8Array(n * n);
  const start = [Math.round((room.doorX + limit) / CELL), Math.round((room.halfSize - ENTRY_DEPTH + limit) / CELL)];
  const queue: number[] = [];
  const all = targets(room);
  const hit = new Set<string>();
  if (free(coord(start[0]), coord(start[1]))) {
    seen[start[1] * n + start[0]] = 1;
    queue.push(start[1] * n + start[0]);
  }
  for (let q = 0; q < queue.length; q++) {
    const ix = queue[q] % n;
    const iz = Math.floor(queue[q] / n);
    const x = coord(ix);
    const z = coord(iz);
    // Alcançar é o que o jogo chama de "no alcance": o centro do avatar a até o raio de interação da borda do alvo.
    for (const t of all) if (!hit.has(t.id) && distanceTo(t.box, x, z) <= t.radius) hit.add(t.id);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= n || jz >= n || seen[jz * n + jx]) continue;
      seen[jz * n + jx] = 1;
      if (free(coord(jx), coord(jz))) queue.push(jz * n + jx);
    }
  }
  return hit;
}

/**
 * O que impede a sala de ser publicada. Na parede: dentro dela, fora do vão da porta, sem sobrepor outro da mesma
 * parede e até 5 por parede (quadros e totens somam). No chão: dentro da sala, fora do corredor da porta, sem sobrepor
 * estações nem outros objetos do chão, e com passagem livre até cada estação e cada totem. E até 20 objetos por sala.
 */
export function roomProblems(room: Room): RoomProblem[] {
  const out: RoomProblem[] = [];
  const add = (code: ProblemCode, itemId: string, extra: Partial<RoomProblem> = {}) => out.push({ code, itemId, ...extra });
  const seen = new Set<string>();
  const perWall = new Map<Wall, number>();
  const floorBoxes: { id: string; box: Box }[] = [];
  const stations = room.stations.map(stationBox);
  const corridor = doorCorridor(room);
  room.items.forEach((it, i) => {
    if (seen.has(it.id)) add('ID_DUPLICATE', it.id);
    seen.add(it.id);
    if (i >= ITEMS_PER_ROOM) add('ITEMS_TOO_MANY', it.id);
    if (it.kind === 'totem' && !VIDEO_ID.test(it.videoId ?? '')) add('VIDEO_ID_INVALID', it.id);
    if (!(it.width > 0)) {
      add('SIZE_NOT_POSITIVE', it.id);
      return;
    }
    if (placementOf(it) === 'wall') {
      const wall = it.wall ?? 'north';
      const offset = it.offset ?? 0;
      const count = (perWall.get(wall) ?? 0) + 1;
      perWall.set(wall, count);
      if (count > WALL_ITEMS_PER_WALL) add('WALL_ITEMS_TOO_MANY', it.id, { wall });
      if (Math.abs(offset) + it.width / 2 > room.halfSize) add('WALL_ITEM_OUTSIDE', it.id);
      if (wall === 'south' && Math.abs(offset - room.doorX) < DOOR_HALF_WIDTH + it.width / 2) add('WALL_ITEM_ON_DOOR', it.id);
      const before = room.items.slice(0, i).filter((o) => placementOf(o) === 'wall' && (o.wall ?? 'north') === wall);
      if (before.some((o) => Math.abs((o.offset ?? 0) - offset) < (o.width + it.width) / 2)) add('WALL_ITEMS_OVERLAP', it.id);
      return;
    }
    const box = floorBox(it);
    const inner = room.halfSize - WALL_THICKNESS / 2;
    if (box.minX < -inner || box.maxX > inner || box.minZ < -inner || box.maxZ > inner) add('FLOOR_ITEM_OUTSIDE', it.id);
    if (overlaps(box, corridor)) add('FLOOR_ITEM_BLOCKS_DOOR', it.id);
    if (stations.some((s) => overlaps(box, s)) || floorBoxes.some((f) => overlaps(box, f.box))) add('FLOOR_ITEMS_OVERLAP', it.id);
    floorBoxes.push({ id: it.id, box });
  });
  // A passagem livre: um alvo que o avatar alcançava sem os objetos do chão e deixou de alcançar com eles. O problema
  // fica no objeto do chão que, sozinho, fecha o caminho (ou no último, quando só juntos eles fecham).
  if (floorBoxes.length > 0 && !out.some((p) => p.code.startsWith('FLOOR_'))) {
    const fixed = [...stations, ...room.items.filter((i) => i.kind === 'totem' && placementOf(i) === 'wall').map((i) => wallTotemBox(room.halfSize, i))];
    const without = reachable(room, fixed);
    const withAll = reachable(room, [...fixed, ...floorBoxes.map((f) => f.box)]);
    for (const t of targets(room)) {
      if (!without.has(t.id) || withAll.has(t.id)) continue;
      const culprits = floorBoxes.filter((f) => f.id !== t.id && !reachable(room, [...fixed, f.box]).has(t.id));
      for (const c of culprits.length > 0 ? culprits : [floorBoxes[floorBoxes.length - 1]]) add('FLOOR_ITEM_BLOCKS_PATH', c.id, { target: t.id });
    }
  }
  return out;
}

/**
 * A sala como mini-campus (a técnica da sala 3D do produto): as paredes são o limite do mapa; as estações, os totens
 * (na parede ou no chão) e as placas de aviso do chão são obstáculos. Os totens têm raio de interação; as mesas e as
 * placas, raio negativo (só obstáculo: na demo, a mesa não abre nada; no produto, o E usa a estação). O quadro de
 * parede não é obstáculo nem alvo.
 */
export function roomAsCampus(room: Room): Campus {
  const asBuilding = (id: string, labelKey: string, box: Box, height: number, radius = OBSTACLE_ONLY): Building => ({
    id,
    labelKey,
    position: [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2],
    size: [box.maxX - box.minX, height, box.maxZ - box.minZ],
    color: '#111827',
    interactionRadius: radius,
  });
  return {
    halfSize: room.halfSize,
    start: { x: room.doorX, z: room.halfSize - ENTRY_DEPTH, heading: Math.PI },
    buildings: [
      ...room.stations.map((s) => asBuilding(`station:${s.id}`, s.labelKey, stationBox(s), s.size[1])),
      ...room.items.flatMap((it) => {
        const floor = placementOf(it) === 'floor';
        if (it.kind === 'board') return floor ? [asBuilding(`sign:${it.id}`, it.textKey, floorBox(it), 1.4)] : [];
        return [asBuilding(it.id, it.textKey, floor ? floorBox(it) : wallTotemBox(room.halfSize, it), 2, TOTEM_RADIUS)];
      }),
    ],
  };
}

/** Os totens da sala (na parede ou no chão), na ordem do documento. */
export const roomTotems = (room: Room): RoomItem[] => room.items.filter((i) => i.kind === 'totem');

/**
 * Aplica uma mudança do editor: a sala só muda se não tiver problema (a sala de antes continua valendo, e nada é
 * gravado). É o "Publicar" do editor do mundo.
 */
export function applyRoom(next: Room): { ok: true; room: Room } | { ok: false; problems: RoomProblem[] } {
  const problems = roomProblems(next);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, room: next };
}

/** Troca um objeto da sala, mantendo a ordem. */
export const replaceItem = (room: Room, item: RoomItem): Room => ({ ...room, items: room.items.map((i) => (i.id === item.id ? item : i)) });

/**
 * Leva um objeto para o chão ou para a parede. No chão, ele vai para o meio da sala, virado para a porta (sul); na
 * parede, para a parede norte, no meio. O master ajusta depois.
 */
export function movePlacement(item: RoomItem, placement: Placement): RoomItem {
  // Só o que todo objeto tem: a posição de antes não vai junto (o documento nunca guarda as duas).
  const rest: RoomItem = { id: item.id, kind: item.kind, textKey: item.textKey, width: item.width, ...(item.videoId !== undefined ? { videoId: item.videoId } : {}) };
  return placement === 'floor' ? { ...rest, placement: 'floor', x: 0, z: 0, facing: 'south' } : { ...rest, wall: 'north', offset: 0 };
}

/** O próximo lugar livre numa parede para um quadro novo de largura `width`, ou o meio quando não há (o validador recusa). */
export function freeOffset(room: Room, wall: Wall, width: number): number {
  const taken = room.items.filter((i) => placementOf(i) === 'wall' && (i.wall ?? 'north') === wall);
  for (let o = -room.halfSize + width / 2; o <= room.halfSize - width / 2 + 1e-9; o += 0.1) {
    const off = Math.round(o * 10) / 10;
    const onDoor = wall === 'south' && Math.abs(off - room.doorX) < DOOR_HALF_WIDTH + width / 2;
    if (!onDoor && !taken.some((t) => Math.abs((t.offset ?? 0) - off) < (t.width + width) / 2)) return off;
  }
  return 0;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Converte o JSON da sala (src/Content/room.json: uma sala de exemplo, fictícia) e confere: formato errado ou sala com
 * problema falham ao abrir a página, com o campo ou o código.
 */
export function toRoom(raw: unknown): Room {
  const r = raw as { halfSize?: unknown; doorX?: unknown; stations?: unknown; items?: unknown };
  if (!isNum(r.halfSize) || r.halfSize < 3 || r.halfSize > 15) throw new Error('room: halfSize precisa estar entre 3 e 15');
  if (!isNum(r.doorX) || Math.abs(r.doorX) > r.halfSize - DOOR_HALF_WIDTH - 0.5) throw new Error('room: a porta precisa caber na parede sul');
  if (!Array.isArray(r.stations) || !Array.isArray(r.items)) throw new Error('room: stations e items precisam ser listas');
  const stations = (r.stations as Record<string, unknown>[]).map((s, i): Station => {
    const p = s.position as unknown[];
    const z = s.size as unknown[];
    if (typeof s.id !== 'string' || typeof s.labelKey !== 'string' || !Array.isArray(p) || p.length !== 2 || !p.every(isNum) || !Array.isArray(z) || z.length !== 3 || !z.every(isNum)) {
      throw new Error(`room.stations[${i}]: id, labelKey, position [x, z] e size [l, a, p]`);
    }
    return { id: s.id, labelKey: s.labelKey, position: [p[0] as number, p[1] as number], size: [z[0] as number, z[1] as number, z[2] as number] };
  });
  const items = (r.items as Record<string, unknown>[]).map((t, i): RoomItem => {
    const at = `room.items[${i}]`;
    if (typeof t.id !== 'string' || (t.kind !== 'board' && t.kind !== 'totem') || typeof t.textKey !== 'string' || !isNum(t.width)) throw new Error(`${at}: id, kind (board ou totem), textKey e width`);
    if (t.placement !== undefined && t.placement !== 'wall' && t.placement !== 'floor') throw new Error(`${at}: placement precisa ser wall ou floor`);
    const base = { id: t.id, kind: t.kind as ItemKind, textKey: t.textKey, width: t.width, ...(t.kind === 'totem' ? { videoId: String(t.videoId ?? '') } : {}) };
    if (t.placement === 'floor') {
      if (!isNum(t.x) || !isNum(t.z) || !WALLS.includes(t.facing as Wall)) throw new Error(`${at}: no chão, x, z e facing`);
      return { ...base, placement: 'floor', x: t.x, z: t.z, facing: t.facing as Wall };
    }
    if (!WALLS.includes(t.wall as Wall) || !isNum(t.offset)) throw new Error(`${at}: na parede, wall e offset`);
    return { ...base, ...(t.placement === 'wall' ? { placement: 'wall' as const } : {}), wall: t.wall as Wall, offset: t.offset };
  });
  const room: Room = { halfSize: r.halfSize, doorX: r.doorX, stations, items };
  const problems = roomProblems(room);
  if (problems.length > 0) throw new Error(`room: ${problems.map((p) => `${p.code}@${p.itemId}`).join('; ')}`);
  return room;
}
