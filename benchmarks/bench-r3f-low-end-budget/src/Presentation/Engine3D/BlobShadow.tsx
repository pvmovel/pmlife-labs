// A sombra do avatar como um plano com textura (decisão 4 da US56): um degradê radial desenhado uma vez num canvas,
// um material para a cena inteira e nenhum passe a mais de render. O ContactShadows do drei, ao contrário, renderiza a
// cena de novo a cada quadro (o benchmark mede a diferença com ?sombraAvatar=contact).
import { CanvasTexture, MeshBasicMaterial } from 'three';

let shared: MeshBasicMaterial | null = null;
function blobMaterial(): MeshBasicMaterial {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  shared = new MeshBasicMaterial({ map: ctx ? new CanvasTexture(canvas) : null, color: ctx ? '#ffffff' : '#000000', transparent: true, depthWrite: false, opacity: ctx ? 1 : 0.3 });
  return shared;
}

export function BlobShadow({ size = 1.2 }: { size?: number }) {
  return (
    <mesh name="sombra-avatar" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={blobMaterial()}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
