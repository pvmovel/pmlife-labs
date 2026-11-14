// O marcador no grafo do three.js, sem WebGL (@react-three/test-renderer): um sprite por prédio marcado, sem sombra,
// por cima dos prédios, todos com o MESMO material (uma textura para a cena inteira), subindo e descendo.
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Sprite } from 'three';
import { describe, expect, it } from 'vitest';
import { GoalMarker, MARKER_GAP, markerMaterial } from '../Presentation/Engine3D/GoalMarker';

describe('marcador 3D', () => {
  it('é um sprite leve: sem sombra, sem teste de profundidade e com um material só para todos', async () => {
    const r = await ReactThreeTestRenderer.create(
      <>
        <GoalMarker buildingId="oficina" x={-8} z={-4} top={4} />
        <GoalMarker buildingId="dados" x={8} z={-4} top={3} />
      </>,
    );
    const a = r.scene.findByProps({ name: 'marcador:oficina' }).instance as Sprite;
    const b = r.scene.findByProps({ name: 'marcador:dados' }).instance as Sprite;
    expect(a.type).toBe('Sprite');
    expect(a.castShadow).toBe(false);
    expect(a.material).toBe(b.material);
    expect(a.material).toBe(markerMaterial());
    expect(a.material.depthTest).toBe(false);
    expect([a.position.x, a.position.z]).toEqual([-8, -4]);
  });

  it('flutua acima do topo do prédio', async () => {
    const r = await ReactThreeTestRenderer.create(<GoalMarker buildingId="produto" x={0} z={-9} top={5} />);
    const ys = new Set<number>();
    for (let i = 0; i < 10; i++) {
      await r.advanceFrames(3, 0.1);
      ys.add(Math.round((r.scene.findByProps({ name: 'marcador:produto' }).instance as Sprite).position.y * 100));
    }
    expect(ys.size).toBeGreaterThan(1);
    for (const y of ys) expect(Math.abs(y / 100 - (5 + MARKER_GAP))).toBeLessThanOrEqual(0.26);
  });
});
