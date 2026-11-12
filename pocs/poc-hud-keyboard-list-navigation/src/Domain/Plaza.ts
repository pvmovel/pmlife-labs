// A praça da demo (US52), em TypeScript puro: o avatar anda em 2D pelas teclas e chega perto dos prédios. A regra que
// importa para o produto é a `avatarStep`: com uma janela aberta (ou o aluno digitando), o avatar não anda, nem com as
// setas que a janela usa para trocar de página.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Building {
  readonly id: string;
  readonly at: Point;
  /** Distância (em metros) em que o aviso "E: entrar" aparece. */
  readonly reach: number;
}

/** O tamanho da praça, em metros. */
export const PLAZA = { width: 30, height: 18 } as const;

/** Velocidade do avatar, em metros por segundo. */
export const SPEED = 6;

const DIRECTIONS: Record<string, Point> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** As teclas (pelo `code`) que andam com o avatar. */
export const MOVE_CODES: ReadonlySet<string> = new Set(Object.keys(DIRECTIONS));

/**
 * O próximo ponto do avatar. `blocked` é a janela aberta ou o aluno digitando: o avatar fica parado, mesmo com as
 * teclas apertadas (sem isso, ← e → da paginação andariam com o avatar atrás da janela).
 */
export function avatarStep(at: Point, pressed: ReadonlySet<string>, seconds: number, blocked: boolean): Point {
  if (blocked) return at;
  let dx = 0;
  let dy = 0;
  for (const code of pressed) {
    const d = DIRECTIONS[code];
    if (d) {
      dx += d.x;
      dy += d.y;
    }
  }
  if (dx === 0 && dy === 0) return at;
  const len = Math.hypot(dx, dy);
  const step = SPEED * Math.min(seconds, 0.1);
  return {
    x: Math.min(PLAZA.width, Math.max(0, at.x + (dx / len) * step)),
    y: Math.min(PLAZA.height, Math.max(0, at.y + (dy / len) * step)),
  };
}

/** O prédio mais perto ao alcance, ou null. */
export function nearest(at: Point, buildings: readonly Building[]): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const b of buildings) {
    const d = Math.hypot(b.at.x - at.x, b.at.y - at.y);
    if (d <= b.reach && d < bestDistance) {
      best = b;
      bestDistance = d;
    }
  }
  return best;
}
