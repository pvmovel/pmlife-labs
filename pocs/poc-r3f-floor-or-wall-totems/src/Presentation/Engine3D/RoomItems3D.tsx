// Os objetos da sala em 3D (US75): o totem de vídeo e o quadro, cada um na parede ou em pé no chão. Na parede, a
// posição vem do wallAnchor (a mesma conta do editor do mundo); no chão, do centro (x, z) e da frente (facing). O
// totem no chão é a mesma tela num pedestal; o quadro no chão vira uma placa de aviso num poste. Clicar ou tocar num
// totem abre o vídeo (como o E). O texto usa a fonte Inter do build: nada vem de outra origem.
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import { FLOOR_DEPTH, facingRotation, placementOf, TOTEM_DEPTH, WALL_THICKNESS, wallAnchor, type RoomItem, type Station } from '../../Domain/Room';

const PANEL_HEIGHT = 1.5;
const BOARD_DEPTH = 0.05;

/** A tela do totem (a moldura, a tela escura com o play e o título), com a frente em +z. */
function TotemScreen({ width, title, highlighted }: { width: number; title: string; highlighted: boolean }) {
  const front = TOTEM_DEPTH / 2 + 0.005;
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[width, PANEL_HEIGHT, TOTEM_DEPTH]} />
        <meshStandardMaterial color={highlighted ? '#fab005' : '#334155'} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.08, front]}>
        <planeGeometry args={[width - 0.2, PANEL_HEIGHT - 0.46]} />
        <meshBasicMaterial color="#0b1120" />
      </mesh>
      <mesh position={[0, 0.08, front + 0.005]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial color="#e03131" />
      </mesh>
      <mesh position={[0.03, 0.08, front + 0.01]} rotation={[0, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.1, 3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Text font={labelFont} position={[0, -PANEL_HEIGHT / 2 + 0.17, front]} fontSize={0.14} maxWidth={width - 0.2} anchorX="center" anchorY="middle" textAlign="center" color="#f8fafc">
        {title}
      </Text>
    </>
  );
}

/** O quadro de texto (na parede) ou a face da placa (no chão), com a frente em +z. */
function BoardFace({ width, height, text }: { width: number; height: number; text: string }) {
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[width, height, BOARD_DEPTH]} />
        <meshStandardMaterial color="#f1f3f5" roughness={0.6} />
      </mesh>
      <Text font={labelFont} position={[0, 0, BOARD_DEPTH / 2 + 0.005]} fontSize={0.16} maxWidth={width - 0.25} anchorX="center" anchorY="middle" textAlign="center" color="#1b1c1f">
        {text}
      </Text>
    </>
  );
}

export function RoomItem3D({ item, halfSize, label, highlighted, onPick }: { item: RoomItem; halfSize: number; label: string; highlighted: boolean; onPick: () => void }) {
  const floor = placementOf(item) === 'floor';
  const totem = item.kind === 'totem';
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPick();
  };
  const pointer = totem ? { onClick: pick, onPointerOver: () => (document.body.style.cursor = 'pointer'), onPointerOut: () => (document.body.style.cursor = '') } : {};
  const name = `item:${item.id}:${floor ? 'floor' : 'wall'}`;
  if (!floor) {
    const inset = WALL_THICKNESS / 2 + (totem ? TOTEM_DEPTH : BOARD_DEPTH) / 2;
    const a = wallAnchor(halfSize, item.wall ?? 'north', item.offset ?? 0, inset);
    return (
      <group name={name} position={[a.x, 1.6, a.z]} rotation={[0, a.rotationY, 0]} {...pointer}>
        {totem ? <TotemScreen width={item.width} title={label} highlighted={highlighted} /> : <BoardFace width={item.width} height={1.2} text={label} />}
      </group>
    );
  }
  // No chão: o pedestal (o que o avatar não atravessa) e, em cima, a tela do totem ou a placa num poste.
  return (
    <group name={name} position={[item.x ?? 0, 0, item.z ?? 0]} rotation={[0, facingRotation(item.facing ?? 'south'), 0]} {...pointer}>
      <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
        <boxGeometry args={[item.width, 0.1, FLOOR_DEPTH]} />
        <meshStandardMaterial color="#495057" roughness={0.8} />
      </mesh>
      {totem ? (
        <>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.2, 0.8, 0.2]} />
            <meshStandardMaterial color="#495057" />
          </mesh>
          <group position={[0, 1.55, 0]}>
            <TotemScreen width={item.width} title={label} highlighted={highlighted} />
          </group>
        </>
      ) : (
        <>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.1, 12]} />
            <meshStandardMaterial color="#868e96" />
          </mesh>
          <group position={[0, 1.4, 0.03]}>
            <BoardFace width={item.width} height={0.8} text={label} />
          </group>
        </>
      )}
    </group>
  );
}

/** A mesa de uma estação (o obstáculo e o alvo das missões, como no produto), com o nome por cima. */
export function Station3D({ station, label }: { station: Station; label: string }) {
  const [w, h, d] = station.size;
  return (
    <group name={`estacao:${station.id}`} position={[station.position[0], 0, station.position[1]]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#1971c2" roughness={0.6} />
      </mesh>
      <Text font={labelFont} position={[0, h + 0.35, 0]} fontSize={0.22} anchorX="center" anchorY="middle" color="#f8fafc" outlineWidth={0.02} outlineColor="#1b1c1f">
        {label}
      </Text>
    </group>
  );
}
