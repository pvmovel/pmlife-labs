// A cena testada pelo grafo do three.js, sem WebGL: cada prédio do JSON vira um objeto com a posição,
// o tamanho e a cor do arquivo. O Text do drei (que baixa a fonte) é trocado por um marcador.
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { JsonCurriculumAdapter } from '../Infrastructure/JsonCurriculumAdapter';
import { CityScene } from '../Presentation/Engine3D/CityScene';

vi.mock('@react-three/drei', () => ({
  Billboard: ({ children }: { children: React.ReactNode }) => <group>{children}</group>,
  Text: ({ children }: { children: string }) => <group name={`rotulo:${children}`} />,
}));

const render = async (trackId: string) => {
  const city = await new JsonCurriculumAdapter().getCity(trackId);
  const renderer = await ReactThreeTestRenderer.create(<CityScene city={city} labelOf={(k) => `[${k}]`} />);
  return { city, scene: renderer.scene };
};

describe('CityScene (Gherkin: renderização a partir do currículo)', () => {
  it('instancia cada prédio com a posição, o tamanho, a cor e o rótulo do JSON', async () => {
    const { city, scene } = await render('culinaria');
    for (const b of city.buildings) {
      const group = scene.findByProps({ name: b.id }).instance;
      expect([group.position.x, group.position.z]).toEqual([...b.position]);

      const body = scene.findByProps({ name: `${b.id}:corpo` }).instance as Mesh<BoxGeometry, MeshStandardMaterial>;
      const { width, height, depth } = body.geometry.parameters;
      expect([width, height, depth]).toEqual([...b.size]);
      expect(body.position.y).toBe(b.size[1] / 2); // nasce no chão
      expect(`#${body.material.color.getHexString()}`).toBe(b.color.toLowerCase());
      expect(body.castShadow && body.receiveShadow).toBe(true);

      expect(scene.findByProps({ name: `rotulo:[${b.labelKey}]` })).toBeTruthy();
    }
  });

  it('trocar de trilha troca a cidade inteira (mesmo componente, outro arquivo)', async () => {
    const culinaria = await render('culinaria');
    const idiomas = await render('idiomas');
    const ids = (s: typeof culinaria.scene) => s.findAll((n) => n.props.name?.endsWith?.(':corpo')).map((n) => n.props.name);
    expect(ids(culinaria.scene)).toHaveLength(4);
    expect(ids(idiomas.scene)).toEqual(['biblioteca:corpo', 'laboratorio-conversacao:corpo', 'intercambio:corpo']);
  });

  it('a luz principal projeta sombra', async () => {
    const { scene } = await render('idiomas');
    const light = scene.findAll((n) => n.type === 'DirectionalLight')[0].instance;
    expect(light.castShadow).toBe(true);
  });
});
