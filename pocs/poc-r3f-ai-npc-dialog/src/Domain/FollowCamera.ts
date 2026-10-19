// Domain: câmera em 3ª pessoa. Fica atrás e acima do avatar e o persegue com suavização.
import type { AvatarState } from './Movement';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FollowConfig {
  /** Distância atrás do avatar. */
  readonly distance: number;
  /** Altura da câmera. */
  readonly height: number;
  /** Rapidez da perseguição (1/s): maior = mais "grudada". */
  readonly stiffness: number;
  /** Altura do ponto para onde a câmera olha (acima do avatar, para enquadrar os prédios e os rótulos). */
  readonly lookHeight: number;
}

export const DEFAULT_FOLLOW: FollowConfig = { distance: 7, height: 4.5, stiffness: 6, lookHeight: 2.5 };

/** Onde a câmera quer estar: atrás do avatar, na direção oposta à que ele olha. */
export function cameraTarget(avatar: AvatarState, cfg: FollowConfig = DEFAULT_FOLLOW): Vec3 {
  return {
    x: avatar.x - Math.sin(avatar.heading) * cfg.distance,
    y: cfg.height,
    z: avatar.z - Math.cos(avatar.heading) * cfg.distance,
  };
}

/**
 * Aproxima `current` de `target` (lerp) com fator 1 − e^(−k·dt): o resultado depende do tempo,
 * não do número de quadros. A câmera se move igual a 30 ou a 144 quadros por segundo.
 */
export function damp(current: Vec3, target: Vec3, stiffness: number, dt: number): Vec3 {
  const a = 1 - Math.exp(-stiffness * Math.max(dt, 0));
  return {
    x: current.x + (target.x - current.x) * a,
    y: current.y + (target.y - current.y) * a,
    z: current.z + (target.z - current.z) * a,
  };
}
