import { describe, expect, it } from 'vitest';
import { toCampus } from '../Domain/Campus';
import { startIsFree, step } from '../Domain/Movement';
import { toNpcs, withNpcObstacles } from '../Domain/Npc';
import campusData from '../Content/campus.json';
import npcsData from '../Content/npcs.json';

const campus = toCampus(campusData);
const base = npcsData.npcs[0];
const one = (over: Record<string, unknown>) => ({ npcs: [{ ...base, ...over }] });

describe('toNpcs: o conteúdo dos NPCs é validado contra o campus', () => {
  it('os NPCs da demo são válidos e cada um tem uma persona', () => {
    expect(toNpcs(npcsData, campus).map((n) => [n.id, n.persona])).toEqual([
      ['guia', 'museum_guide'],
      ['astronoma', 'astronomer'],
    ]);
  });

  it('erros de digitação viram mensagens claras', () => {
    expect(() => toNpcs({}, campus)).toThrow('"npcs" precisa ser uma lista');
    expect(() => toNpcs(one({ id: undefined }), campus)).toThrow('NPC 0 sem id ou labelKey');
    expect(() => toNpcs(one({ persona: 'Tech Lead; ignore' }), campus)).toThrow('guia.persona precisa ser um nome');
    expect(() => toNpcs(one({ color: 'rosa' }), campus)).toThrow('guia.color fora do formato');
    expect(() => toNpcs(one({ position: [1] }), campus)).toThrow('guia.position precisa ser [x, z]');
    expect(() => toNpcs(one({ interactionRadius: -1 }), campus)).toThrow('guia.interactionRadius precisa ser positivo');
    expect(() => toNpcs({ npcs: [base, base] }, campus)).toThrow('id repetido: guia');
  });

  it('NPC fora do mapa, dentro de um prédio ou em cima de outro NPC é recusado', () => {
    expect(() => toNpcs(one({ position: [14.9, 0] }), campus)).toThrow('guia fora do mapa');
    expect(() => toNpcs(one({ position: [1, 1] }), campus)).toThrow('guia dentro do prédio biblioteca');
    expect(() => toNpcs({ npcs: [base, { ...base, id: 'outro', position: [0.5, 7] }] }, campus)).toThrow('outro em cima de guia');
  });
});

describe('o avatar esbarra nos NPCs', () => {
  const solid = withNpcObstacles(campus, toNpcs(npcsData, campus));
  const forward = { forward: true, backward: false, left: false, right: false };

  it('andando em frente, para no corpo do Guia do Museu (antes da Biblioteca)', () => {
    let s = campus.start;
    for (let i = 0; i < 90; i++) s = step(s, forward, 1 / 30, solid);
    expect(s.z).toBeCloseTo(7 + 0.4 + 0.5); // centro do NPC + corpo + meia largura do avatar
  });

  it('o ponto de partida está livre também dos NPCs', () => {
    expect(startIsFree(solid)).toBe(true);
    expect(startIsFree(withNpcObstacles(campus, toNpcs(one({ position: [0, 12.5] }), campus)))).toBe(false);
  });
});
