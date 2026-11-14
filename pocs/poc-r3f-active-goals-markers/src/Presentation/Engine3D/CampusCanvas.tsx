// O campus da fase, carregado com React.lazy (three + fiber + drei num chunk próprio): os prédios vêm do dado, o avatar,
// a colisão, a proximidade e a câmera são os do campus do produto, e os marcadores das metas ficam sobre os prédios.
// Com uma janela aberta, o avatar para.
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import type { Campus } from '../../Domain/Campus';
import { cameraTarget } from '../../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { Building3D } from './Building3D';
import { KEY_MAP } from './controls';
import { GoalMarker } from './GoalMarker';
import { KeyboardAvatar } from './KeyboardAvatar';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';

declare global {
  interface Window {
    /** Quadros desenhados pela cena (o e2e confere que ela anda). */
    __frames?: number;
    /** Os prédios com o marcador DESENHADO na cena (o e2e confere o 3D, não só o HUD). */
    __markers?: string[];
  }
}

interface Props {
  campus: Campus;
  labelOf: (key: string) => string;
  ariaLabel: string;
  /** Prédios com o marcador (vazio com os marcadores desligados). */
  marked: readonly string[];
  nearbyId: string | null;
  onNearbyChange: (buildingId: string | null) => void;
  onMove?: (state: AvatarState) => void;
  /** Com uma janela aberta, o avatar fica parado. */
  locked: boolean;
  touchInput?: () => MoveInput;
}

function FrameCounter() {
  useFrame(() => {
    window.__frames = (window.__frames ?? 0) + 1;
  });
  return null;
}

/** Publica os marcadores que a cena montou, lendo o grafo do three.js. */
function MarkerProbe() {
  const seen = useRef('');
  useFrame(({ scene }) => {
    const names: string[] = [];
    scene.traverse((o) => {
      if (o.name.startsWith('marcador:')) names.push(o.name.slice('marcador:'.length));
    });
    const key = names.join(',');
    if (key !== seen.current) {
      seen.current = key;
      window.__markers = names;
    }
  });
  useEffect(() => () => void (window.__markers = []), []);
  return null;
}

export default function CampusCanvas({ campus, labelOf, ariaLabel, marked, nearbyId, onNearbyChange, onMove, locked, touchInput }: Props) {
  const stateRef = useRef<AvatarState>({ ...campus.start });
  const start = cameraTarget(campus.start);
  const side = campus.halfSize * 2;
  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas data-testid="campus-canvas" shadows dpr={[1, 2]} camera={{ position: [start.x, start.y, start.z], fov: 50 }} role="img" aria-label={ariaLabel}>
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
        {campus.buildings
          .filter((b) => marked.includes(b.id))
          .map((b) => (
            <GoalMarker key={b.id} buildingId={b.id} x={b.position[0]} z={b.position[1]} top={b.size[1]} />
          ))}
        <KeyboardAvatar campus={campus} active={!locked} stateRef={stateRef} onMove={onMove} touchInput={touchInput} />
        <ProximityTrigger campus={campus} stateRef={stateRef} onChange={onNearbyChange} />
        <ThirdPersonCamera stateRef={stateRef} />
        <FrameCounter />
        <MarkerProbe />
      </Canvas>
    </KeyboardControls>
  );
}
