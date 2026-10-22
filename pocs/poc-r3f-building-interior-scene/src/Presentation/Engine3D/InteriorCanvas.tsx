// Cena interna de um prédio (US32), carregada com React.lazy num chunk próprio. Toda a sala vem do dado
// (src/Content/interiors.json): o domínio a converte num mini-campus, e o avatar, a colisão, a proximidade, a câmera
// e o joystick são os mesmos do campus. Geometria simples, sem modelo externo: nada a baixar e nada a cachear.
import { Suspense, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { cameraTarget } from '../../Domain/FollowCamera';
import { atDoor, DOOR_HALF_WIDTH, interiorAsCampus, type Interior } from '../../Domain/Interior';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { Building3D } from './Building3D';
import { KEY_MAP } from './controls';
import { KeyboardAvatar } from './KeyboardAvatar';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';

const WALL_HEIGHT = 3;
/** Estação concluída fica verde. Nada de ✓ no rótulo 3D: a fonte embutida (Inter latin) não tem o símbolo, e o
 * texto 3D buscaria uma fonte reserva num CDN (achado do e2e). */
const DONE_COLOR = '#2f9e44';
const WALL = 0.2;

interface Props {
  interior: Interior;
  labelOf: (key: string) => string;
  ariaLabel: string;
  completed: ReadonlySet<string>;
  onNearbyChange: (stationId: string | null) => void;
  onMove?: (state: AvatarState) => void;
  /** O avatar passou pela porta: volta ao campus. */
  onExit: () => void;
  /** Primeiro quadro desenhado (para medir o tempo de entrada). */
  onReady: () => void;
  locked: boolean;
  highlightedId: string | null;
  touchInput?: () => MoveInput;
}

/** Avisa a página no primeiro quadro e quando o avatar passa pela porta (uma vez só). */
function Watchers({ interior, stateRef, onExit, onReady }: { interior: Interior; stateRef: MutableRefObject<AvatarState>; onExit: () => void; onReady: () => void }) {
  const ready = useRef(false);
  const left = useRef(false);
  useFrame(() => {
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    const { x, z } = stateRef.current;
    if (!left.current && atDoor(x, z, interior)) {
      left.current = true;
      onExit();
    }
  });
  return null;
}

function Room({ interior }: { interior: Interior }) {
  const h = interior.halfSize;
  const side = h * 2;
  const leftLen = interior.doorX - DOOR_HALF_WIDTH + h;
  const rightLen = h - (interior.doorX + DOOR_HALF_WIDTH);
  const wall = (key: string, position: [number, number, number], size: [number, number, number]) => (
    <mesh key={key} position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#e9ecef" roughness={0.9} />
    </mesh>
  );
  return (
    <>
      <mesh name="piso" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[side, side]} />
        <meshStandardMaterial color="#8d6e63" roughness={0.8} />
      </mesh>
      {wall('norte', [0, WALL_HEIGHT / 2, -h], [side, WALL_HEIGHT, WALL])}
      {wall('oeste', [-h, WALL_HEIGHT / 2, 0], [WALL, WALL_HEIGHT, side])}
      {wall('leste', [h, WALL_HEIGHT / 2, 0], [WALL, WALL_HEIGHT, side])}
      {/* Parede sul com o vão da porta. */}
      {wall('sul-esquerda', [-h + leftLen / 2, WALL_HEIGHT / 2, h], [leftLen, WALL_HEIGHT, WALL])}
      {wall('sul-direita', [h - rightLen / 2, WALL_HEIGHT / 2, h], [rightLen, WALL_HEIGHT, WALL])}
      <mesh name="porta" position={[interior.doorX, 0.02, h - 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2, 0.6]} />
        <meshBasicMaterial color="#fab005" />
      </mesh>
    </>
  );
}

export default function InteriorCanvas({ interior, labelOf, ariaLabel, completed, onNearbyChange, onMove, onExit, onReady, locked, highlightedId, touchInput }: Props) {
  const room = interiorAsCampus(interior);
  const stateRef = useRef<AvatarState>({ ...room.start });
  const start = cameraTarget(room.start);
  const bounds = interior.halfSize - 0.4;

  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas
        data-testid="interior-canvas"
        shadows
        dpr={[1, 2]}
        camera={{ position: [start.x, start.y, Math.min(start.z, bounds)], fov: 60 }}
        role="img"
        aria-label={ariaLabel}
      >
        <color attach="background" args={['#1b1c1f']} />
        <ambientLight intensity={0.8} />
        <pointLight position={[0, WALL_HEIGHT - 0.3, 0]} intensity={30} distance={interior.halfSize * 4} />
        <Room interior={interior} />
        <Suspense fallback={null}>
          {room.buildings.map((s) => (
            <Building3D key={s.id} building={completed.has(s.id) ? { ...s, color: DONE_COLOR } : s} label={labelOf(s.labelKey)} highlighted={s.id === highlightedId} />
          ))}
        </Suspense>
        <KeyboardAvatar campus={room} active={!locked} stateRef={stateRef} onMove={onMove} touchInput={touchInput} />
        <ProximityTrigger campus={room} stateRef={stateRef} onChange={onNearbyChange} />
        <ThirdPersonCamera stateRef={stateRef} bounds={bounds} />
        <Watchers interior={interior} stateRef={stateRef} onExit={onExit} onReady={onReady} />
      </Canvas>
    </KeyboardControls>
  );
}
