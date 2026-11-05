// A pré-visualização 3D (React Three Fiber, o mesmo motor do campus): a cidade com os prédios em caixas e o ponto de
// chegada, ou a sala com a porta, as estações e os objetos de parede. Fica num pedaço próprio do bundle (React.lazy):
// só é baixada quando alguém pede, e o editor continua leve.
import { Canvas } from '@react-three/fiber';
import type { Interior, World } from '../Domain/World';
import type { View } from './useEditor';

export default function Preview3D({ world, view }: { world: World; view: View }) {
  const room = view.kind === 'interior' ? world.interiors.find((i) => i.buildingId === view.buildingId) : undefined;
  const half = room ? room.halfSize : world.halfSize;
  return (
    <Canvas camera={{ position: [0, half * 1.6, half * 1.9], fov: 45 }} dpr={[1, 2]} data-testid="preview-canvas">
      <color attach="background" args={['#0b1220']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[half, half * 2, half]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshStandardMaterial color={room ? '#334155' : '#1e293b'} />
      </mesh>
      {room ? <Room room={room} /> : <City world={world} />}
    </Canvas>
  );
}

function City({ world }: { world: World }) {
  return (
    <>
      {world.buildings.map((b) => (
        <mesh key={b.id} position={[b.x, b.height / 2, b.z]}>
          <boxGeometry args={[b.width, b.height, b.depth]} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
      <mesh position={[world.spawn.x, 0.3, world.spawn.z]}>
        <cylinderGeometry args={[0.6, 0.6, 0.6, 24]} />
        <meshStandardMaterial color="#fde047" />
      </mesh>
    </>
  );
}

const WALL_HEIGHT = 3;

function Room({ room }: { room: Interior }) {
  const H = room.halfSize;
  const walls: [number, number, number, number][] = [
    [0, -H, 2 * H, 0],
    [H, 0, 2 * H, Math.PI / 2],
    [-H, 0, 2 * H, Math.PI / 2],
  ];
  return (
    <>
      {walls.map(([x, z, len, rot], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2, z]} rotation={[0, rot, 0]}>
          <boxGeometry args={[len, WALL_HEIGHT, 0.2]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      {/* A parede sul, com o vão da porta. */}
      {[
        [-H, room.doorX - 1],
        [room.doorX + 1, H],
      ].map(([a, b], i) =>
        b > a ? (
          <mesh key={`s${i}`} position={[(a + b) / 2, WALL_HEIGHT / 2, H]}>
            <boxGeometry args={[b - a, WALL_HEIGHT, 0.2]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        ) : null,
      )}
      {room.stations.map((s) => (
        <mesh key={s.id} position={[s.x, 0.5, s.z]}>
          <cylinderGeometry args={[0.6, 0.6, 1, 24]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>
      ))}
      {room.wallItems.map((w) => {
        const pos: [number, number, number] =
          w.wall === 'north' ? [w.offset, 1.6, -H + 0.15] : w.wall === 'south' ? [w.offset, 1.6, H - 0.15] : w.wall === 'east' ? [H - 0.15, 1.6, w.offset] : [-H + 0.15, 1.6, w.offset];
        const rot = w.wall === 'east' || w.wall === 'west' ? Math.PI / 2 : 0;
        return (
          <mesh key={w.id} position={pos} rotation={[0, rot, 0]}>
            <boxGeometry args={[w.width, 1, 0.08]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        );
      })}
    </>
  );
}
