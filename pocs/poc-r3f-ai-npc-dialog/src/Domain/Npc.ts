// Domain: personagens com quem o avatar conversa (US22b). É dado (src/Content/npcs.json), validado contra o campus.
//
// O JSON só diz QUAL persona o NPC usa (um nome). O que a persona sabe e como fala fica no servidor:
// nenhum prompt vai para o navegador.
import { footprint, type Building, type Campus, type Footprint } from './Campus';

export interface Npc {
  readonly id: string;
  readonly labelKey: string;
  /** Nome da persona na lista branca do servidor. */
  readonly persona: string;
  /** Posição no chão (x, z), em metros. */
  readonly position: readonly [number, number];
  readonly color: string;
  /** Distância (em metros, a partir do corpo) em que o aviso aparece. Padrão: 2. */
  readonly interactionRadius?: number;
}

/** Meia largura do corpo do NPC: o avatar esbarra nele como num prédio pequeno. */
export const NPC_BODY_RADIUS = 0.4;
const NPC_HEIGHT = 1.8;

/** Quadrado no chão ocupado pelo corpo do NPC. */
export const npcFootprint = (n: Npc): Footprint => ({
  minX: n.position[0] - NPC_BODY_RADIUS,
  maxX: n.position[0] + NPC_BODY_RADIUS,
  minZ: n.position[1] - NPC_BODY_RADIUS,
  maxZ: n.position[1] + NPC_BODY_RADIUS,
});

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const PERSONA = /^[a-z][a-z0-9_]{0,31}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const touches = (a: Footprint, b: Footprint) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/**
 * Converte o JSON em NPCs, conferindo o formato e o lugar de cada um: dentro do mapa, fora dos prédios e
 * sem dois NPCs no mesmo ponto. Conteúdo malformado falha com a mensagem do campo errado.
 */
export function toNpcs(raw: unknown, campus: Campus): Npc[] {
  const list = (raw as { npcs?: unknown })?.npcs;
  if (!Array.isArray(list)) throw new Error('npcs: "npcs" precisa ser uma lista');
  const seen = new Set<string>();
  const npcs = list.map((n: Record<string, unknown>, i: number): Npc => {
    if (typeof n.id !== 'string' || typeof n.labelKey !== 'string') throw new Error(`npcs: NPC ${i} sem id ou labelKey`);
    if (seen.has(n.id)) throw new Error(`npcs: id repetido: ${n.id}`);
    seen.add(n.id);
    if (typeof n.persona !== 'string' || !PERSONA.test(n.persona)) throw new Error(`npcs: ${n.id}.persona precisa ser um nome como "museum_guide"`);
    if (typeof n.color !== 'string' || !COLOR.test(n.color)) throw new Error(`npcs: ${n.id}.color fora do formato #rrggbb`);
    if (!Array.isArray(n.position) || n.position.length !== 2 || !n.position.every(isNum)) throw new Error(`npcs: ${n.id}.position precisa ser [x, z]`);
    if (n.interactionRadius !== undefined && !(isNum(n.interactionRadius) && n.interactionRadius > 0)) {
      throw new Error(`npcs: ${n.id}.interactionRadius precisa ser positivo`);
    }
    return {
      id: n.id,
      labelKey: n.labelKey,
      persona: n.persona,
      color: n.color,
      position: [n.position[0], n.position[1]],
      ...(isNum(n.interactionRadius) ? { interactionRadius: n.interactionRadius } : {}),
    };
  });

  const limit = campus.halfSize - NPC_BODY_RADIUS;
  npcs.forEach((npc, i) => {
    const f = npcFootprint(npc);
    if (Math.abs(npc.position[0]) > limit || Math.abs(npc.position[1]) > limit) throw new Error(`npcs: ${npc.id} fora do mapa`);
    const building = campus.buildings.find((b) => touches(f, footprint(b)));
    if (building) throw new Error(`npcs: ${npc.id} dentro do prédio ${building.id}`);
    const other = npcs.slice(0, i).find((o) => touches(f, npcFootprint(o)));
    if (other) throw new Error(`npcs: ${npc.id} em cima de ${other.id}`);
  });
  return npcs;
}

/**
 * O campus visto pela colisão do avatar: os prédios mais o corpo de cada NPC, como obstáculos.
 * (A proximidade continua usando o campus e os NPCs separados: um NPC não vira "prédio" no aviso.)
 */
export function withNpcObstacles(campus: Campus, npcs: readonly Npc[]): Campus {
  const obstacles = npcs.map(
    (n): Building => ({ id: `npc:${n.id}`, labelKey: n.labelKey, position: n.position, size: [NPC_BODY_RADIUS * 2, NPC_HEIGHT, NPC_BODY_RADIUS * 2], color: n.color }),
  );
  return { ...campus, buildings: [...campus.buildings, ...obstacles] };
}
