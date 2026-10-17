// Um prédio: só traduz o dado (posição, tamanho, cor, rótulo) em objetos 3D. Nenhum prédio existe no código.
import { Billboard, Text } from '@react-three/drei';
import type { Building } from '../../Domain/City';
import labelFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url';

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
          material-depthTest={false}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}
