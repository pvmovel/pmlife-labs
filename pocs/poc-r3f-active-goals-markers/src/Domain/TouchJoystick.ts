// Domain: o joystick de toque vira a mesma entrada do teclado (MoveInput). TypeScript puro: a Presentation só mede
// onde está o dedo em relação ao centro do joystick e chama estas funções.
//
// Coordenadas da tela: x cresce para a direita e y para baixo. Arrastar para cima anda; para os lados, gira.
import type { MoveInput } from './Movement';

export const STILL: MoveInput = { forward: false, backward: false, left: false, right: false };

/** Fração do raio em que o dedo ainda não move o avatar (o dedo nunca fica parado no centro). */
export const DEFAULT_DEAD_ZONE = 0.25;

// Um eixo só conta se o dedo estiver a menos de 67,5° dele: 8 direções (4 retas e 4 diagonais), como num direcional.
const AXIS_SHARE = Math.sin(Math.PI / 8);

/**
 * Deslocamento do dedo (dx, dy), já dividido pelo raio do joystick, em direções do avatar.
 * Dentro da zona morta, ou com valores inválidos, o avatar fica parado.
 */
export function joystickToMoveInput(dx: number, dy: number, deadZone: number = DEFAULT_DEAD_ZONE): MoveInput {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return STILL;
  const length = Math.hypot(dx, dy);
  if (length <= deadZone) return STILL;
  const share = AXIS_SHARE * length;
  return { forward: dy < -share, backward: dy > share, left: dx < -share, right: dx > share };
}

/** Leva o dedo para dentro do círculo do joystick: o pino nunca sai da base, por mais longe que o dedo vá. */
export function clampToRadius(dx: number, dy: number, radius: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length <= radius || length === 0) return { dx, dy };
  return { dx: (dx / length) * radius, dy: (dy / length) * radius };
}

/** Teclado e joystick juntos: cada direção vale se qualquer um dos dois pedir. */
export function combineInputs(a: MoveInput, b: MoveInput): MoveInput {
  return { forward: a.forward || b.forward, backward: a.backward || b.backward, left: a.left || b.left, right: a.right || b.right };
}
