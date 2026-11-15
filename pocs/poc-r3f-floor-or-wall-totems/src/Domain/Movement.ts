// Domain: um passo do avatar. TypeScript puro: o R3F só lê o teclado e aplica o resultado a cada quadro.
//
// Controles (estilo RPG em 3ª pessoa): frente/trás andam na direção do avatar; esquerda/direita giram.
// Colisão: o avatar é uma caixa de lado 2·radius; o movimento é resolvido por eixo (x, depois z),
// então encostar num prédio desliza pela parede em vez de travar.
import { footprint, type Campus } from './Campus';

export interface AvatarState {
  readonly x: number;
  readonly z: number;
  /** Para onde o avatar olha, em radianos (0 = +z; aumenta girando para a esquerda). */
  readonly heading: number;
}

export interface MoveInput {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface MovementConfig {
  /** Metros por segundo. */
  readonly speed: number;
  /** Radianos por segundo. */
  readonly turnSpeed: number;
  /** Meia largura da caixa do avatar. */
  readonly radius: number;
  /** Maior dt aceito: uma aba que volta do segundo plano não pode teleportar o avatar. */
  readonly maxDt: number;
}

export const DEFAULT_MOVEMENT: MovementConfig = { speed: 6, turnSpeed: 2.5, radius: 0.5, maxDt: 1 / 30 };

/** Avança o avatar por `dt` segundos, respeitando os limites do mapa e os prédios. */
export function step(state: AvatarState, input: MoveInput, dt: number, campus: Campus, cfg: MovementConfig = DEFAULT_MOVEMENT): AvatarState {
  const t = Math.min(Math.max(dt, 0), cfg.maxDt);
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const heading = state.heading + turn * cfg.turnSpeed * t;
  const move = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  let { x, z } = state;
  if (move !== 0) {
    const distance = move * cfg.speed * t;
    // Subpassos menores que o avatar: nunca atravessa uma parede fina, mesmo num quadro lento.
    const parts = Math.max(1, Math.ceil(Math.abs(distance) / cfg.radius));
    const dx = (Math.sin(heading) * distance) / parts;
    const dz = (Math.cos(heading) * distance) / parts;
    for (let i = 0; i < parts; i++) {
      x = resolveX(x + dx, z, dx, campus, cfg.radius);
      z = resolveZ(x, z + dz, dz, campus, cfg.radius);
    }
  }
  return { x, z, heading };
}

const overlaps = (x: number, z: number, r: number, f: ReturnType<typeof footprint>) =>
  x + r > f.minX && x - r < f.maxX && z + r > f.minZ && z - r < f.maxZ;

function resolveX(x: number, z: number, dx: number, campus: Campus, r: number): number {
  const limit = campus.halfSize - r;
  let nx = Math.min(limit, Math.max(-limit, x));
  for (const b of campus.buildings) {
    const f = footprint(b);
    if (overlaps(nx, z, r, f)) nx = dx > 0 ? f.minX - r : f.maxX + r;
  }
  return nx;
}

function resolveZ(x: number, z: number, dz: number, campus: Campus, r: number): number {
  const limit = campus.halfSize - r;
  let nz = Math.min(limit, Math.max(-limit, z));
  for (const b of campus.buildings) {
    const f = footprint(b);
    if (overlaps(x, nz, r, f)) nz = dz > 0 ? f.minZ - r : f.maxZ + r;
  }
  return nz;
}

/** O avatar começa num lugar livre e dentro do mapa? (valida o conteúdo antes de a cena abrir). */
export function startIsFree(campus: Campus, cfg: MovementConfig = DEFAULT_MOVEMENT): boolean {
  const { x, z } = campus.start;
  const limit = campus.halfSize - cfg.radius;
  return Math.abs(x) <= limit && Math.abs(z) <= limit && !campus.buildings.some((b) => overlaps(x, z, cfg.radius, footprint(b)));
}
