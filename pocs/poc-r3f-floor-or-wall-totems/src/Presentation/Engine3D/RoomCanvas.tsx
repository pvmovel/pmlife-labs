// A sala 3D com os objetos na parede ou no chão (US75), carregada com React.lazy num chunk próprio. A sala vem do dado
// (src/Content/room.json) e do editor: o domínio a converte num mini-campus, e o avatar, a colisão, a proximidade e a
// câmera são os da sala do produto. Com o vídeo aberto, o Canvas para de desenhar (frameloop "never"): o vídeo usa a CPU e a bateria
// sozinho, e o avatar volta no mesmo lugar.
import { Suspense, useEffect, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { cameraTarget } from '../../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { DOOR_HALF_WIDTH, roomAsCampus, WALL_THICKNESS, type Room } from '../../Domain/Room';
import { KEY_MAP } from './controls';
import { KeyboardAvatar } from './KeyboardAvatar';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { RoomItem3D, Station3D } from './RoomItems3D';

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

declare global {
  interface Window {
    /** Os objetos DESENHADOS na cena, como "id:wall" ou "id:floor" (o e2e confere o 3D, não só o editor). */
    __items?: string[];
    /** O avatar no último quadro (o e2e usa para virar na direção de um alvo). */
    __avatar?: AvatarState;
  }
}

function FrameCounter({ onFrame }: { onFrame?: () => void }) {
  useFrame(() => onFrame?.());
  return null;
}

/** Publica os objetos que a cena montou, lendo o grafo do three.js, e a posição do avatar. */
function SceneProbe({ stateRef }: { stateRef: MutableRefObject<AvatarState> }) {
  const seen = useRef('');
  useFrame(({ scene }) => {
    window.__avatar = stateRef.current;
    const names: string[] = [];
    scene.traverse((o) => {
      if (o.name.startsWith('item:')) names.push(o.name.slice('item:'.length));
    });
    const key = names.sort().join(',');
    if (key !== seen.current) {
      seen.current = key;
      window.__items = names;
    }
  });
  useEffect(() => () => void (window.__items = []), []);
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
          {room.stations.map((s) => (
            <Station3D key={s.id} station={s} label={labelOf(s.labelKey)} />
          ))}
          {room.items.map((it) => (
            <RoomItem3D key={`${it.id}:${it.placement ?? 'wall'}`} item={it} halfSize={room.halfSize} label={labelOf(it.textKey)} highlighted={it.id === nearbyId} onPick={() => onPick(it.id)} />
          ))}
        </Suspense>
        <KeyboardAvatar campus={campus} active={!paused} stateRef={stateRef} touchInput={touchInput} />
        <ProximityTrigger campus={campus} stateRef={stateRef} onChange={onNearbyChange} />
        <ThirdPersonCamera stateRef={stateRef} bounds={bounds} />
        <FrameCounter onFrame={onFrame} />
        <SceneProbe stateRef={stateRef} />
      </Canvas>
    </KeyboardControls>
  );
}
