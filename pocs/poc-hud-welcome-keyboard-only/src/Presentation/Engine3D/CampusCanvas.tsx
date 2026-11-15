// A sede de exemplo, carregada com React.lazy (three + fiber + drei num chunk próprio): os prédios vêm do dado; o
// avatar, a colisão, a proximidade e as duas câmeras (3ª pessoa e orbital) são as do campus do produto. Com uma janela
// aberta ou no modo Orbital, o avatar para.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import type { Campus } from '../../Domain/Campus';
import { cameraTarget } from '../../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { Building3D } from './Building3D';
import { KEY_MAP } from './controls';
import { KeyboardAvatar } from './KeyboardAvatar';
import { OrbitCamera } from './OrbitCamera';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';

export type NavigationMode = 'avatar' | 'orbital';

declare global {
  interface Window {
    /** Quadros desenhados pela cena (o e2e confere que ela anda). */
    __frames?: number;
    /** A altura da câmera no último quadro (o e2e confere que o M mudou a visão de verdade, não só o botão). */
    __cameraY?: number;
  }
}

interface Props {
  campus: Campus;
  mode: NavigationMode;
  labelOf: (key: string) => string;
  ariaLabel: string;
  nearbyId: string | null;
  onNearbyChange: (buildingId: string | null) => void;
  onMove?: (state: AvatarState) => void;
  /** Com uma janela aberta, o avatar fica parado. */
  locked: boolean;
  touchInput?: () => MoveInput;
}

function Probe() {
  useFrame(({ camera }) => {
    window.__frames = (window.__frames ?? 0) + 1;
    window.__cameraY = camera.position.y;
  });
  return null;
}

export default function CampusCanvas({ campus, mode, labelOf, ariaLabel, nearbyId, onNearbyChange, onMove, locked, touchInput }: Props) {
  const stateRef = useRef<AvatarState>({ ...campus.start });
  const start = cameraTarget(campus.start);
  const side = campus.halfSize * 2;
  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas data-testid="campus-canvas" data-mode={mode} shadows dpr={[1, 2]} camera={{ position: [start.x, start.y, start.z], fov: 50 }} role="img" aria-label={ariaLabel}>
        <color attach="background" args={['#0b1120']} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[12, 22, 10]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-campus.halfSize}
          shadow-camera-right={campus.halfSize}
          shadow-camera-top={campus.halfSize}
          shadow-camera-bottom={-campus.halfSize}
        />
        <mesh name="chao" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[side, side]} />
          <meshStandardMaterial color="#3b4a63" />
        </mesh>
        <gridHelper args={[side, side / 2, '#66d9e8', '#4c5d7a']} position={[0, 0.01, 0]} />
        <Suspense fallback={null}>
          {campus.buildings.map((b) => (
            <Building3D key={b.id} building={b} label={labelOf(b.labelKey)} highlighted={b.id === nearbyId} />
          ))}
        </Suspense>
        <KeyboardAvatar campus={campus} active={mode === 'avatar' && !locked} stateRef={stateRef} onMove={onMove} touchInput={touchInput} />
        <ProximityTrigger campus={campus} stateRef={stateRef} onChange={onNearbyChange} />
        {mode === 'avatar' ? <ThirdPersonCamera stateRef={stateRef} /> : <OrbitCamera />}
        <Probe />
      </Canvas>
    </KeyboardControls>
  );
}
