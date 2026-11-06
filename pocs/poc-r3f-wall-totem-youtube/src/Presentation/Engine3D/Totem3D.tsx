// Um totem de vídeo preso à parede: a moldura, a tela escura com o botão de play e o título. Clicar ou tocar no totem
// abre o vídeo (como o E). O texto usa a fonte Inter embutida no build: nada vem de outra origem. A posição vem do
// domínio (wallAnchor), a mesma conta dos quadros do editor do mundo.
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import { TOTEM_DEPTH, WALL_THICKNESS, wallAnchor, type Totem } from '../../Domain/Room';

const PANEL_HEIGHT = 1.5;
const CENTER_Y = 1.6;

export function Totem3D({ totem, halfSize, title, highlighted, onPick }: { totem: Totem; halfSize: number; title: string; highlighted: boolean; onPick: () => void }) {
  const a = wallAnchor(halfSize, totem.wall, totem.offset, WALL_THICKNESS / 2 + TOTEM_DEPTH / 2);
  const w = totem.width;
  const front = TOTEM_DEPTH / 2 + 0.005;
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPick();
  };
  return (
    <group name={`totem:${totem.id}`} position={[a.x, CENTER_Y, a.z]} rotation={[0, a.rotationY, 0]} onClick={pick} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      {/* A moldura (fica amarela quando o avatar está no alcance). */}
      <mesh name={`totem:${totem.id}:moldura`} castShadow>
        <boxGeometry args={[w, PANEL_HEIGHT, TOTEM_DEPTH]} />
        <meshStandardMaterial color={highlighted ? '#fab005' : '#334155'} roughness={0.5} />
      </mesh>
      {/* A tela. */}
      <mesh position={[0, 0.08, front]}>
        <planeGeometry args={[w - 0.2, PANEL_HEIGHT - 0.46]} />
        <meshBasicMaterial color="#0b1120" />
      </mesh>
      {/* O botão de play: um círculo vermelho com o triângulo branco. */}
      <mesh position={[0, 0.08, front + 0.005]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial color="#e03131" />
      </mesh>
      <mesh position={[0.03, 0.08, front + 0.01]} rotation={[0, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.1, 3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Text font={labelFont} position={[0, -PANEL_HEIGHT / 2 + 0.17, front]} fontSize={0.14} maxWidth={w - 0.2} anchorX="center" anchorY="middle" textAlign="center" color="#f8fafc">
        {title}
      </Text>
    </group>
  );
}
