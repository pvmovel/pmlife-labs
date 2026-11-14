// O marcador de meta sobre o prédio (US55): um sprite só, sem sombra, sem modelo nem textura baixada. A imagem (um
// losango âmbar com uma seta para baixo) é desenhada uma vez num canvas e reaproveitada por todos os marcadores: um
// material e uma textura para a cena inteira, o que pesa quase nada no celular. O sprite fica sempre de frente para a
// câmera, por cima dos prédios (sem teste de profundidade), e sobe e desce devagar para chamar o olho.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SpriteMaterial, type Sprite } from 'three';

const SIZE = 128;

function drawTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null; // sem canvas 2D (jsdom nos testes): o sprite fica só com a cor
  ctx.fillStyle = '#fab005';
  ctx.strokeStyle = '#0b1120';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2, 6);
  ctx.lineTo(SIZE - 10, SIZE / 2 - 8);
  ctx.lineTo(SIZE / 2, SIZE - 6);
  ctx.lineTo(10, SIZE / 2 - 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0b1120';
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 22, SIZE / 2 - 22);
  ctx.lineTo(SIZE / 2 + 22, SIZE / 2 - 22);
  ctx.lineTo(SIZE / 2, SIZE / 2 + 16);
  ctx.closePath();
  ctx.fill();
  return new CanvasTexture(canvas);
}

let shared: SpriteMaterial | null = null;
/** O material único de todos os marcadores, criado na primeira vez que um aparece. */
export function markerMaterial(): SpriteMaterial {
  if (!shared) {
    const map = drawTexture();
    shared = new SpriteMaterial({ map, color: map ? '#ffffff' : '#fab005', depthTest: false, depthWrite: false, transparent: true });
  }
  return shared;
}

/** Altura do marcador acima do topo do prédio, em metros. */
export const MARKER_GAP = 2.2;

export function GoalMarker({ buildingId, x, z, top }: { buildingId: string; x: number; z: number; top: number }) {
  const sprite = useRef<Sprite>(null);
  const time = useRef(0);
  const base = top + MARKER_GAP;
  useFrame((_, dt) => {
    time.current += dt;
    if (sprite.current) sprite.current.position.y = base + Math.sin(time.current * 2.4) * 0.25;
  });
  return <sprite ref={sprite} name={`marcador:${buildingId}`} position={[x, base, z]} scale={[1.4, 1.4, 1]} material={markerMaterial()} renderOrder={20} />;
}
