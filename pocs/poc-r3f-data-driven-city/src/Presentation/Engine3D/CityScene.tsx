// Conteúdo da cena, sem o <Canvas>: testável com o @react-three/test-renderer (sem WebGL).
import type { CityDefinition } from '../../Domain/City';
import { Building3D } from './Building3D';

export function CityScene({ city, labelOf }: { city: CityDefinition; labelOf: (labelKey: string) => string }) {
  return (
    <>
      <ambientLight intensity={0.7} />
      {/* Sombra só funciona com shadows no Canvas + castShadow na luz + castShadow/receiveShadow nos objetos. */}
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <mesh name="chao" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#3b4a63" />
      </mesh>
      {city.buildings.map((b) => (
        <Building3D key={b.id} building={b} label={labelOf(b.labelKey)} />
      ))}
    </>
  );
}
