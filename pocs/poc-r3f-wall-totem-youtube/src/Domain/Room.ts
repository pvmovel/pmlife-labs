// Domain: a sala com os objetos de parede (o formato do editor do mundo do produto: parede, posição ao longo dela e
// largura). O totem de vídeo é um tipo novo de objeto de parede, com o ID do vídeo e o título; a sala de uma versão que
// não conhece o tipo simplesmente não o desenha. TypeScript puro.
import type { Building, Campus } from './Campus';
import { VIDEO_ID } from './YouTube';

export const WALLS = ['north', 'east', 'south', 'west'] as const;
export type Wall = (typeof WALLS)[number];

/** Um totem de vídeo preso à parede. */
export interface Totem {
  readonly id: string;
  readonly kind: 'totem';
  readonly wall: Wall;
  /** Centro ao longo da parede (de oeste para leste no norte e no sul; de norte para sul no leste e no oeste). */
  readonly offset: number;
  /** Largura ocupada na parede. */
  readonly width: number;
  /** O ID do vídeo (11 caracteres); nunca o link. */
  readonly videoId: string;
  /** Chave do título do totem. */
  readonly titleKey: string;
}

/** A sala: um quadrado com a porta na parede sul (+z). */
export interface Room {
  readonly halfSize: number;
  readonly doorX: number;
  readonly totems: readonly Totem[];
}

/** Meia largura do vão da porta. */
export const DOOR_HALF_WIDTH = 1;
/** Espessura das paredes. */
export const WALL_THICKNESS = 0.2;
/** Distância (a partir da tela do totem) em que o aviso de interação aparece. */
export const TOTEM_RADIUS = 1.6;
/** Profundidade do totem (a moldura com a tela), a partir da face de dentro da parede. */
export const TOTEM_DEPTH = 0.25;

/** Onde um objeto fica na sala: o centro na face de dentro da parede, afastado `inset`, e a rotação para o centro. */
export function wallAnchor(halfSize: number, wall: Wall, offset: number, inset = 0): { x: number; z: number; rotationY: number; horizontal: boolean } {
  const d = halfSize - inset;
  if (wall === 'north') return { x: offset, z: -d, rotationY: 0, horizontal: true };
  if (wall === 'south') return { x: offset, z: d, rotationY: Math.PI, horizontal: true };
  if (wall === 'east') return { x: d, z: offset, rotationY: -Math.PI / 2, horizontal: false };
  return { x: -d, z: offset, rotationY: Math.PI / 2, horizontal: false };
}

/** Um problema da sala: código estável (a tela traduz) e o totem apontado. */
export interface RoomProblem {
  readonly code: 'TOTEM_OUTSIDE' | 'TOTEM_ON_DOOR' | 'TOTEMS_OVERLAP' | 'VIDEO_ID_INVALID' | 'ID_DUPLICATE';
  readonly totemId: string;
}

/**
 * O que impede a sala de ser publicada: o totem fora da parede, sobre a porta, sobre outro totem da mesma parede, com
 * o ID do vídeo fora do formato ou com o id repetido. É a mesma regra dos objetos de parede do produto (US37).
 */
export function roomProblems(room: Room): RoomProblem[] {
  const out: RoomProblem[] = [];
  const seen = new Set<string>();
  room.totems.forEach((t, i) => {
    if (seen.has(t.id)) out.push({ code: 'ID_DUPLICATE', totemId: t.id });
    seen.add(t.id);
    const half = t.width / 2;
    if (!(t.width > 0) || Math.abs(t.offset) + half > room.halfSize - WALL_THICKNESS / 2) out.push({ code: 'TOTEM_OUTSIDE', totemId: t.id });
    else if (t.wall === 'south' && Math.abs(t.offset - room.doorX) < half + DOOR_HALF_WIDTH) out.push({ code: 'TOTEM_ON_DOOR', totemId: t.id });
    if (room.totems.slice(0, i).some((o) => o.wall === t.wall && Math.abs(o.offset - t.offset) < (o.width + t.width) / 2)) out.push({ code: 'TOTEMS_OVERLAP', totemId: t.id });
    if (!VIDEO_ID.test(t.videoId)) out.push({ code: 'VIDEO_ID_INVALID', totemId: t.id });
  });
  return out;
}

/**
 * A sala como mini-campus (a técnica da sala 3D do produto): as paredes são o limite do mapa, e cada totem é um
 * obstáculo fino encostado na parede, com raio de interação. Assim o movimento, a colisão, a proximidade e o aviso do
 * campus funcionam com os totens sem código novo.
 */
export function roomAsCampus(room: Room): Campus {
  return {
    halfSize: room.halfSize,
    start: { x: room.doorX, z: room.halfSize - 1.5, heading: Math.PI },
    buildings: room.totems.map((t): Building => {
      const a = wallAnchor(room.halfSize, t.wall, t.offset, WALL_THICKNESS / 2 + TOTEM_DEPTH / 2);
      return {
        id: t.id,
        labelKey: t.titleKey,
        position: [a.x, a.z],
        size: a.horizontal ? [t.width, 2, TOTEM_DEPTH] : [TOTEM_DEPTH, 2, t.width],
        color: '#111827',
        interactionRadius: TOTEM_RADIUS,
      };
    }),
  };
}

/**
 * Configura um totem pelo painel do admin: o link vira o ID; o link que não é do YouTube é recusado sem mudar nada, e a
 * sala com problema também (o totem sobre a porta, por exemplo).
 *
 * @returns A sala nova, ou o motivo da recusa (a sala de antes continua valendo).
 */
export function configureTotem(room: Room, totemId: string, patch: { videoId: string | null; wall: Wall; offset: number }): { ok: true; room: Room } | { ok: false; problems: RoomProblem[] } {
  if (patch.videoId === null) return { ok: false, problems: [{ code: 'VIDEO_ID_INVALID', totemId }] };
  const next: Room = { ...room, totems: room.totems.map((t) => (t.id === totemId ? { ...t, videoId: patch.videoId as string, wall: patch.wall, offset: patch.offset } : t)) };
  const problems = roomProblems(next);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, room: next };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Converte o JSON da sala (src/Content/room.json: uma sala de exemplo, fictícia) e confere: formato errado ou sala
 * com problema falham ao abrir a página, com o campo ou o código.
 */
export function toRoom(raw: unknown): Room {
  const r = raw as { halfSize?: unknown; doorX?: unknown; totems?: unknown };
  if (!isNum(r.halfSize) || r.halfSize < 3 || r.halfSize > 15) throw new Error('room: halfSize precisa estar entre 3 e 15');
  if (!isNum(r.doorX) || Math.abs(r.doorX) > r.halfSize - DOOR_HALF_WIDTH - 0.5) throw new Error('room: a porta precisa caber na parede sul');
  if (!Array.isArray(r.totems)) throw new Error('room: totems precisa ser uma lista');
  const totems = (r.totems as Record<string, unknown>[]).map((t, i): Totem => {
    const at = `room.totems[${i}]`;
    if (typeof t.id !== 'string' || t.kind !== 'totem' || typeof t.titleKey !== 'string' || typeof t.videoId !== 'string') throw new Error(`${at}: sem id, kind "totem", titleKey ou videoId`);
    if (!WALLS.includes(t.wall as Wall)) throw new Error(`${at}: parede desconhecida`);
    if (!isNum(t.offset) || !isNum(t.width)) throw new Error(`${at}: offset e width precisam ser números`);
    return { id: t.id, kind: 'totem', wall: t.wall as Wall, offset: t.offset, width: t.width, videoId: t.videoId, titleKey: t.titleKey };
  });
  const room: Room = { halfSize: r.halfSize, doorX: r.doorX, totems };
  const problems = roomProblems(room);
  if (problems.length > 0) throw new Error(`room: ${problems.map((p) => `${p.code}@${p.totemId}`).join('; ')}`);
  return room;
}
