// A sala 3D com os totens de vídeo nas paredes, carregada com React.lazy num chunk próprio. A sala vem do dado
// (src/Content/room.json): o domínio a converte num mini-campus, e o avatar, a colisão, a proximidade e a câmera são os
// da sala do produto. Com o vídeo aberto, o Canvas para de desenhar (frameloop "never"): o vídeo usa a CPU e a bateria
// sozinho, e o avatar volta no mesmo lugar.
import { Suspense, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { cameraTarget } from '../../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { DOOR_HALF_WIDTH, roomAsCampus, WALL_THICKNESS, type Room } from '../../Domain/Room';
import { KEY_MAP } from './controls';
import { KeyboardAvatar } from './KeyboardAvatar';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { Totem3D } from './Totem3D';

const WALL_HEIGHT = 3;

interface Props {
  room: Room;
  labelOf: (key: string) => string;
  ariaLabel: string;
  /** Com o vídeo aberto, a cena não desenha nem anda. */
  paused: boolean;
  nearbyId: string | null;
  onNearbyChange: (totemId: string | null) => void;
  /** Clique ou toque num totem. */
  onPick: (totemId: string) => void;
  touchInput?: () => MoveInput;
  /** A cada quadro desenhado (o e2e confere que a cena para com o vídeo aberto). */
  onFrame?: () => void;
}

function FrameCounter({ onFrame }: { onFrame?: () => void }) {
  useFrame(() => onFrame?.());
  return null;
}

function Walls({ room }: { room: Room }) {
  const h = room.halfSize;
  const side = h * 2;
  const leftLen = room.doorX - DOOR_HALF_WIDTH + h;
  const rightLen = h - (room.doorX + DOOR_HALF_WIDTH);
  const wall = (key: string, position: [number, number, number], size: [number, number, number]) => (
    <mesh key={key} name={`parede-${key}`} position={position} receiveShadow>
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
      {wall('norte', [0, WALL_HEIGHT / 2, -h], [side, WALL_HEIGHT, WALL_THICKNESS])}
      {wall('oeste', [-h, WALL_HEIGHT / 2, 0], [WALL_THICKNESS, WALL_HEIGHT, side])}
      {wall('leste', [h, WALL_HEIGHT / 2, 0], [WALL_THICKNESS, WALL_HEIGHT, side])}
      {wall('sul-esquerda', [-h + leftLen / 2, WALL_HEIGHT / 2, h], [leftLen, WALL_HEIGHT, WALL_THICKNESS])}
      {wall('sul-direita', [h - rightLen / 2, WALL_HEIGHT / 2, h], [rightLen, WALL_HEIGHT, WALL_THICKNESS])}
    </>
  );
}

export default function RoomCanvas({ room, labelOf, ariaLabel, paused, nearbyId, onNearbyChange, onPick, touchInput, onFrame }: Props) {
  const campus = roomAsCampus(room);
  const stateRef: MutableRefObject<AvatarState> = useRef<AvatarState>({ ...campus.start });
  const start = cameraTarget(campus.start);
  const bounds = room.halfSize - 0.4;
  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas
        data-testid="room-canvas"
        shadows
        dpr={[1, 2]}
        frameloop={paused ? 'never' : 'always'}
        camera={{ position: [start.x, start.y, Math.min(start.z, bounds)], fov: 60 }}
        role="img"
        aria-label={ariaLabel}
      >
        <color attach="background" args={['#1b1c1f']} />
        <ambientLight intensity={0.8} />
        <pointLight position={[0, WALL_HEIGHT - 0.3, 0]} intensity={30} distance={room.halfSize * 4} />
        <Walls room={room} />
        <Suspense fallback={null}>
          {room.totems.map((t) => (
            <Totem3D key={t.id} totem={t} halfSize={room.halfSize} title={labelOf(t.titleKey)} highlighted={t.id === nearbyId} onPick={() => onPick(t.id)} />
          ))}
        </Suspense>
        <KeyboardAvatar campus={campus} active={!paused} stateRef={stateRef} touchInput={touchInput} />
        <ProximityTrigger campus={campus} stateRef={stateRef} onChange={onNearbyChange} />
        <ThirdPersonCamera stateRef={stateRef} bounds={bounds} />
        <FrameCounter onFrame={onFrame} />
      </Canvas>
    </KeyboardControls>
  );
}
