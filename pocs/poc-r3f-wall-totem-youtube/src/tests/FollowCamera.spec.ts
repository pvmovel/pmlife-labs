import { describe, expect, it } from 'vitest';
import { cameraTarget, damp, DEFAULT_FOLLOW, type Vec3 } from '../Domain/FollowCamera';

describe('câmera em 3ª pessoa', () => {
  it('fica atrás do avatar (oposta à direção do olhar) e acima', () => {
    expect(cameraTarget({ x: 0, z: 10, heading: Math.PI })).toEqual({
      x: expect.closeTo(0),
      y: DEFAULT_FOLLOW.height,
      z: expect.closeTo(10 + DEFAULT_FOLLOW.distance),
    });
  });

  it('converge para o alvo', () => {
    let c: Vec3 = { x: 0, y: 0, z: 0 };
    const target = { x: 10, y: 4, z: -3 };
    for (let i = 0; i < 120; i++) c = damp(c, target, 6, 1 / 60);
    expect(c.x).toBeCloseTo(10, 2);
    expect(c.z).toBeCloseTo(-3, 2);
  });

  it('a suavização depende do tempo, não do FPS: 1 s a 30 ou a 60 quadros dá o mesmo ponto', () => {
    const run = (fps: number) => {
      let c: Vec3 = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < fps; i++) c = damp(c, { x: 10, y: 0, z: 0 }, 2, 1 / fps);
      return c.x;
    };
    expect(run(30)).toBeCloseTo(run(60), 10);
  });
});
