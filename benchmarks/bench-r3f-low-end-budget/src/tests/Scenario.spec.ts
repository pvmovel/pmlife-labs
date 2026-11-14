import { describe, expect, it } from 'vitest';
import { benchCity, cameraPath } from '../Domain/Scenario';
import { resultFileName } from '../Presentation/report';

describe('as cidades do benchmark (US56)', () => {
  it('a do curso tem o tamanho de uma fase real; a de estresse, 200 prédios dentro do mapa, sem id repetido', () => {
    const curso = benchCity('curso');
    expect([curso.buildings.length, curso.npcs.length, curso.halfSize]).toEqual([3, 4, 15]);
    const stress = benchCity('estresse');
    expect(stress.buildings.length).toBe(200);
    expect(new Set(stress.buildings.map((b) => b.id)).size).toBe(200);
    expect(stress.buildings.every((b) => Math.abs(b.position[0]) + b.size[0] / 2 <= stress.halfSize && Math.abs(b.position[1]) + b.size[2] / 2 <= stress.halfSize)).toBe(true);
  });

  it('a câmera faz a mesma volta em todo aparelho (determinística, uma volta em 20 s)', () => {
    expect(cameraPath(3, 15)).toEqual(cameraPath(3, 15));
    const a = cameraPath(0, 15).position;
    const b = cameraPath(20, 15).position;
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[2]).toBeCloseTo(a[2], 6);
  });

  it('o nome do arquivo de resultado sai do modelo do aparelho', () => {
    expect(resultFileName('Moto E13 (Android 13)')).toBe('moto-e13-android-13.json');
    expect(resultFileName('Notebook Intel® UHD 620')).toBe('notebook-intel-uhd-620.json');
    expect(resultFileName('  ')).toBe('aparelho.json');
  });
});
