// A cena medida (US56): a mesma receita do campus do produto (luz com sombra, grade, plataforma, prédios em caixa com
// rótulo de texto sempre de frente, NPCs em cápsula), com o avatar e a sombra dele no chão. A câmera faz a mesma volta
// em todo aparelho (Domain/Scenario.cameraPath); na visão orbital, fica parada.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, ContactShadows, Grid, Text } from '@react-three/drei';
import { MeshBasicMaterial, type Group } from 'three';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import { cameraPath, type BenchCity } from '../../Domain/Scenario';
import { BlobShadow } from './BlobShadow';

const LABEL_MATERIAL = new MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true });

export type AvatarShadow = 'blob' | 'contact' | 'none';

function Avatar({ city, shadow, moving }: { city: BenchCity; shadow: AvatarShadow; moving: boolean }) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!moving || !group.current) return;
    // O avatar anda um pouco à frente da câmera, no chão, como na 3ª pessoa.
    const t = state.clock.elapsedTime;
    const ahead = cameraPath(t, city.halfSize).position;
    group.current.position.set(ahead[0] * 0.75, 0, ahead[2] * 0.75);
  });
  return (
    <group ref={group} name="avatar">
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 1, 4, 12]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {shadow === 'blob' && <BlobShadow />}
      {shadow === 'contact' && <ContactShadows position={[0, 0.02, 0]} scale={4} blur={2} far={2} opacity={0.5} />}
    </group>
  );
}

function CameraDriver({ city }: { city: BenchCity }) {
  useFrame((state) => {
    const { position, target } = cameraPath(state.clock.elapsedTime, city.halfSize);
    state.camera.position.set(...position);
    state.camera.lookAt(...target);
  });
  return null;
}

export function BenchScene({ city, shadows, avatarShadow, moving }: { city: BenchCity; shadows: boolean; avatarShadow: AvatarShadow; moving: boolean }) {
  const s = city.halfSize;
  return (
    <>
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[s + 5, 2 * s, s - 5]}
        intensity={1.5}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-(s + 5)}
        shadow-camera-right={s + 5}
        shadow-camera-top={s + 5}
        shadow-camera-bottom={-(s + 5)}
      />
      <Grid position={[0, 0.01, 0]} args={[2 * s + 10, 2 * s + 10]} cellSize={1} cellColor="#1e293b" sectionSize={5} sectionColor="#0c8599" fadeDistance={2 * s + 20} />
      <mesh name="plataforma" position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[2 * s, 0.5, 2 * s]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {city.buildings.map((b) => (
        <group key={b.id} name={b.id} position={[b.position[0], 0, b.position[1]]}>
          <mesh position={[0, b.size[1] / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={b.color} roughness={0.3} metalness={0.2} />
          </mesh>
          <Billboard position={[0, b.size[1] + 0.8, 0]}>
            <Text font={labelFont} fontSize={0.6} color="#f8fafc" outlineWidth={0.04} outlineColor="#020617" anchorY="middle" material={LABEL_MATERIAL} renderOrder={10}>
              {b.label}
            </Text>
          </Billboard>
        </group>
      ))}
      {city.npcs.map(([x, z], i) => (
        <mesh key={i} name={`npc-${i}`} position={[x, 0.9, z]} castShadow>
          <capsuleGeometry args={[0.35, 1, 4, 12]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
      ))}
      <Avatar city={city} shadow={avatarShadow} moving={moving} />
      {moving && <CameraDriver city={city} />}
    </>
  );
}
