// Visão orbital livre do mapa: ao entrar, a câmera sobe para uma vista geral do campus; arrastar gira,
// roda ou pinça aproxima. Funciona no toque.
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

/** Vista geral: alto e afastado, olhando para o centro do mapa. */
export const OVERVIEW: [number, number, number] = [12, 17, 18];

export function OrbitCamera() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(...OVERVIEW);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return <OrbitControls makeDefault target={[0, 0, 0]} minDistance={8} maxDistance={50} maxPolarAngle={Math.PI / 2.2} />;
}
