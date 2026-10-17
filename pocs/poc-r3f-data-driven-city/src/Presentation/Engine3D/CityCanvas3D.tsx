// Carregado com React.lazy: three + fiber + drei ficam num chunk separado, baixado só quando a cena aparece.
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CityDefinition } from '../../Domain/City';
import { CityScene } from './CityScene';

export default function CityCanvas3D({ city, labelOf, ariaLabel }: { city: CityDefinition; labelOf: (k: string) => string; ariaLabel: string }) {
  return (
    <Canvas
      shadows
      // Cidade estática: só redesenha quando algo muda (câmera, troca de trilha), em vez de 60 quadros por segundo parados.
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [4, 15, 22], fov: 45 }}
      aria-label={ariaLabel}
      role="img"
    >
      <color attach="background" args={['#0b1120']} />
      {/* A fonte dos rótulos carrega dentro do Canvas; enquanto isso a cena aparece sem rótulos. */}
      <Suspense fallback={null}>
        <CityScene city={city} labelOf={labelOf} />
      </Suspense>
      <OrbitControls makeDefault enablePan={false} minDistance={10} maxDistance={40} maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
