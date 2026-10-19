// Um NPC: só traduz o dado (posição, cor, rótulo) em objetos 3D, sem modelo externo (nada a baixar nem a cachear).
// Quando o avatar chega perto, o NPC vira para ele; longe, fica onde estava.
import { Suspense, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { MeshBasicMaterial, type Group } from 'three';
import type { AvatarState } from '../../Domain/Movement';
import type { Npc } from '../../Domain/Npc';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';

/** A partir desta distância (centro a centro, em metros) o NPC acompanha o avatar com o olhar. */
export const NPC_LOOK_DISTANCE = 6;
const TURN_RATE = 6; // quão rápido o NPC vira (por segundo)
const LABEL_MATERIAL = new MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true });

/** Menor diferença entre dois ângulos, em (-π, π]: virar de 170° para -170° é girar 20°, não 340°. */
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function Npc3D({ npc, label, highlighted = false, avatarRef }: { npc: Npc; label: string; highlighted?: boolean; avatarRef: MutableRefObject<AvatarState> }) {
  const body = useRef<Group>(null);
  const [x, z] = npc.position;

  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    const dx = avatarRef.current.x - x;
    const dz = avatarRef.current.z - z;
    if (Math.hypot(dx, dz) > NPC_LOOK_DISTANCE) return;
    // Mesma convenção do avatar: heading 0 olha para +z, então o ângulo para o alvo é atan2(dx, dz).
    g.rotation.y += angleDelta(g.rotation.y, Math.atan2(dx, dz)) * Math.min(1, dt * TURN_RATE);
  });

  return (
    <group name={`npc:${npc.id}`} position={[x, 0, z]}>
      {highlighted && (
        <mesh name={`npc:${npc.id}:alcance`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.6, 0.85, 32]} />
          <meshBasicMaterial color="#fab005" transparent opacity={0.7} />
        </mesh>
      )}
      <group ref={body} name={`npc:${npc.id}:corpo`}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <capsuleGeometry args={[0.35, 0.8, 6, 16]} />
          <meshStandardMaterial color={npc.color} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.65, 0]} castShadow>
          <sphereGeometry args={[0.28, 20, 16]} />
          <meshStandardMaterial color="#f1e3d3" roughness={0.6} />
        </mesh>
        {/* Visor: mostra para onde o NPC olha (+z local). */}
        <mesh position={[0, 1.68, 0.24]}>
          <boxGeometry args={[0.36, 0.1, 0.1]} />
          <meshStandardMaterial color="#0b1120" />
        </mesh>
      </group>
      {/* O rótulo espera a fonte num Suspense próprio: o corpo aparece (e vira para o avatar) mesmo antes dela. */}
      <Suspense fallback={null}>
        <Billboard position={[0, 2.45, 0]}>
          <Text font={labelFont} fontSize={0.42} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.035} outlineColor="#0b1120" renderOrder={10} material={LABEL_MATERIAL}>
            {label}
          </Text>
        </Billboard>
      </Suspense>
    </group>
  );
}
