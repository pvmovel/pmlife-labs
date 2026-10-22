// Um prédio: só traduz o dado (posição, tamanho, cor, rótulo) em objetos 3D. Nenhum prédio existe no código.
import { useEffect } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { MeshBasicMaterial } from 'three';
import type { Building } from '../../Domain/Campus';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import { isClick } from './picking';

// Material dos rótulos sem teste de profundidade: o troika deriva o material do texto a partir deste,
// então o rótulo é desenhado por cima de qualquer prédio. (A prop material-depthTest não chega ao material derivado.)
const LABEL_MATERIAL = new MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true });

const setCursor = (value: string) => {
  document.body.style.cursor = value;
};

export function Building3D({
  building,
  label,
  highlighted = false,
  onSelect,
}: {
  building: Building;
  label: string;
  highlighted?: boolean;
  /** Modo Orbital: clicar ou tocar no prédio (corpo ou rótulo) o seleciona. Sem isto, o prédio não é clicável. */
  onSelect?: (id: string) => void;
}) {
  const [x, z] = building.position;
  const [w, h, d] = building.size;
  // Saindo do modo Orbital (ou abrindo uma janela) com o mouse em cima do prédio, o cursor não fica preso em "mão".
  useEffect(() => {
    if (!onSelect) setCursor('');
  }, [onSelect]);
  // Os eventos sobem dos filhos para o grupo: corpo e rótulo contam como o prédio.
  const pointer = onSelect && {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (!isClick(e.delta)) return; // fim de um arraste da câmera: não seleciona
      e.stopPropagation(); // só o prédio mais à frente recebe o clique
      onSelect(building.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setCursor('pointer');
    },
    onPointerOut: () => setCursor(''),
  };
  return (
    <group name={building.id} position={[x, 0, z]} {...pointer}>
      {/* Contorno no chão quando o avatar está no alcance: mostra com qual prédio o aviso fala. */}
      {highlighted && (
        <mesh name={`${building.id}:alcance`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[w + 0.6, d + 0.6]} />
          <meshBasicMaterial color="#fab005" transparent opacity={0.45} />
        </mesh>
      )}
      <mesh name={`${building.id}:corpo`} position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={building.color} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Fonte local, importada pelo código (sai com hash no build): nada de CDN de terceiros nem cache velho. */}
      {/* Billboard: o rótulo sempre de frente para a câmera, de qualquer ângulo. */}
      <Billboard position={[0, h + 0.8, 0]}>
        {/* Sem teste de profundidade: o rótulo de um prédio nunca some atrás de outro. */}
        <Text
          font={labelFont}
          fontSize={0.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#0b1120"
          renderOrder={10}
          material={LABEL_MATERIAL}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}
