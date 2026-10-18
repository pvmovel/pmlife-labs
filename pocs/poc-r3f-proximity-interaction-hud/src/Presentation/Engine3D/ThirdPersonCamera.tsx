// Câmera em 3ª pessoa: persegue o ponto atrás do avatar com suavização independente do FPS (FollowCamera.damp).
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { cameraTarget, damp, DEFAULT_FOLLOW } from '../../Domain/FollowCamera';
import type { AvatarState } from '../../Domain/Movement';

export function ThirdPersonCamera({ stateRef }: { stateRef: MutableRefObject<AvatarState> }) {
  useFrame(({ camera }, dt) => {
    const avatar = stateRef.current;
    const p = damp(camera.position, cameraTarget(avatar), DEFAULT_FOLLOW.stiffness, dt);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(avatar.x, DEFAULT_FOLLOW.lookHeight, avatar.z);
  });
  return null;
}
