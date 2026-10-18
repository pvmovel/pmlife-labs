// Um prédio: só traduz o dado (posição, tamanho, cor, rótulo) em objetos 3D. Nenhum prédio existe no código.
import { Billboard, Text } from '@react-three/drei';
import { MeshBasicMaterial } from 'three';
import type { Building } from '../../Domain/Campus';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';

// Material dos rótulos sem teste de profundidade: o troika deriva o material do texto a partir deste,
// então o rótulo é desenhado por cima de qualquer prédio. (A prop material-depthTest não chega ao material derivado.)
const LABEL_MATERIAL = new MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true });

export function Building3D({ building, label }: { building: Building; label: string }) {
  const [x, z] = building.position;
  const [w, h, d] = building.size;
  return (
    <group name={building.id} position={[x, 0, z]}>
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
