// Câmera em 3ª pessoa: persegue o ponto atrás do avatar com suavização independente do FPS (FollowCamera.damp).
// Na sala interna (US32), `bounds` mantém a câmera dentro das paredes: atrás do avatar, ela ficaria do lado de fora, e a
// parede taparia a cena.
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { cameraTarget, damp, DEFAULT_FOLLOW } from '../../Domain/FollowCamera';
import type { AvatarState } from '../../Domain/Movement';

export function ThirdPersonCamera({ stateRef, bounds }: { stateRef: MutableRefObject<AvatarState>; bounds?: number }) {
  useFrame(({ camera }, dt) => {
    const avatar = stateRef.current;
    const p = damp(camera.position, cameraTarget(avatar), DEFAULT_FOLLOW.stiffness, dt);
    const clamp = (v: number) => (bounds === undefined ? v : Math.max(-bounds, Math.min(bounds, v)));
    camera.position.set(clamp(p.x), p.y, clamp(p.z));
    camera.lookAt(avatar.x, DEFAULT_FOLLOW.lookHeight, avatar.z);
  });
  return null;
}
