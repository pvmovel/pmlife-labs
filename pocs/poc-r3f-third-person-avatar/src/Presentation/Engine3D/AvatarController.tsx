// Avatar: a cada quadro lê a entrada, pede o próximo passo ao domínio (Movement.step) e aplica no objeto 3D.
// A entrada é uma função: no app vem do KeyboardControls; nos testes, de um fake.
import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Campus } from '../../Domain/Campus';
import { step, type AvatarState, type MoveInput } from '../../Domain/Movement';

const STILL: MoveInput = { forward: false, backward: false, left: false, right: false };

export function AvatarController({
  campus,
  active,
  stateRef,
  readInput,
  onMove,
}: {
  campus: Campus;
  /** Fora do modo Avatar as teclas não movem o personagem. */
  active: boolean;
  /** Estado compartilhado com a câmera em 3ª pessoa (sem re-render do React a cada quadro). */
  stateRef: MutableRefObject<AvatarState>;
  readInput: () => MoveInput;
  onMove?: (state: AvatarState) => void;
}) {
  const avatar = useRef<Group>(null);

  useFrame((_, dt) => {
    const next = step(stateRef.current, active ? readInput() : STILL, dt, campus);
    stateRef.current = next;
    avatar.current?.position.set(next.x, 0, next.z);
    avatar.current?.rotation.set(0, next.heading, 0);
    onMove?.(next);
  });

  const { x, z, heading } = stateRef.current;
  return (
    <group ref={avatar} name="avatar" position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Corpo e cabeça simples, sem modelo externo: nada a baixar e nada a cachear. */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.9, 6, 16]} />
        <meshStandardMaterial color="#fab005" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.3, 20, 16]} />
        <meshStandardMaterial color="#ffe8a3" roughness={0.6} />
      </mesh>
      {/* "Nariz": mostra para onde o avatar olha (+z local). */}
      <mesh position={[0, 1.2, 0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.15, 0.35, 12]} />
        <meshStandardMaterial color="#e8590c" />
      </mesh>
    </group>
  );
}
