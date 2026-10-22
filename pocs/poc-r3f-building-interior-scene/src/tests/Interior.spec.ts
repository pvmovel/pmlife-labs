// Interior orientado a dados (Domain): validação contra o campus, a sala como mini-campus, porta e saída.
import { describe, expect, it } from 'vitest';
import { toCampus } from '../Domain/Campus';
import { atDoor, exitPoint, interiorAsCampus, interiorProblems, toInteriors, type Interior } from '../Domain/Interior';
import { step } from '../Domain/Movement';
import { nearestInteractable } from '../Domain/Proximity';
import campusData from '../Content/campus.json';
import interiorsData from '../Content/interiors.json';

const campus = toCampus(campusData);
const interiors = toInteriors(interiorsData, campus);
const library = interiors.get('biblioteca')!;
const valid = interiorsData.interiors[0];
const broken = (patch: Record<string, unknown>) => () => toInteriors({ interiors: [{ ...valid, ...patch }] }, campus);
const FORWARD = { forward: true, backward: false, left: false, right: false };
const BACKWARD = { forward: false, backward: true, left: false, right: false };

describe('toInteriors (conteúdo validado)', () => {
  it('o conteúdo da demo é válido: biblioteca e laboratório; os outros prédios não têm interior', () => {
    expect([...interiors.keys()]).toEqual(['biblioteca', 'laboratorio']);
    expect(interiorProblems(library, campus)).toEqual([]);
  });

  it('recusa prédio inexistente, porta fora da parede, sala sem estação e XP inválido', () => {
    expect(broken({ buildingId: 'piscina' })).toThrow(/prédio inexistente/);
    expect(broken({ doorX: 6 })).toThrow(/porta/);
    expect(broken({ stations: [] })).toThrow(/pelo menos uma estação/);
    expect(broken({ stations: [{ ...valid.stations[0], rewardXp: 0 }] })).toThrow(/rewardXp/);
  });

  it('recusa estação fora das paredes, estações sobrepostas e estação bloqueando a porta', () => {
    expect(broken({ stations: [{ ...valid.stations[0], position: [5.5, 0] }] })).toThrow(/sai das paredes/);
    expect(broken({ stations: [valid.stations[0], { ...valid.stations[1], id: 'outra', position: [0.5, -2] }] })).toThrow(/sobrepõe/);
    expect(broken({ stations: [{ ...valid.stations[0], position: [0, 3.5] }] })).toThrow(/bloqueia a porta/);
  });

  it('recusa id de estação repetido entre salas (a missão é única na trilha)', () => {
    const lab = { ...interiorsData.interiors[1], stations: [{ ...interiorsData.interiors[1].stations[0], id: 'biblioteca-leitura' }] };
    expect(() => toInteriors({ interiors: [valid, lab] }, campus)).toThrow(/repetido/);
  });
});

describe('a sala como mini-campus', () => {
  const room = interiorAsCampus(library);

  it('entra pela porta, olhando para o fundo da sala; as estações são obstáculos com raio de interação', () => {
    expect(room.start).toEqual({ x: 0, z: 4.5, heading: Math.PI });
    expect(room.buildings.map((b) => b.id)).toEqual(['biblioteca-leitura', 'biblioteca-resumo']);
  });

  it('andando para a frente, chega à estação da leitura (aviso) e para na mesa, sem atravessar', () => {
    let s = room.start;
    for (let i = 0; i < 120; i++) s = step(s, FORWARD, 1 / 30, room);
    expect(nearestInteractable(s.x, s.z, room)?.building.id).toBe('biblioteca-leitura');
    expect(s.z).toBeCloseTo(-2 + 0.6 + 0.5); // face da mesa (z = -1,4) + meia largura do avatar
  });

  it('andando para trás, encosta na parede sul no vão da porta: saiu', () => {
    let s = room.start;
    expect(atDoor(s.x, s.z, library)).toBe(false);
    for (let i = 0; i < 30; i++) s = step(s, BACKWARD, 1 / 30, room);
    expect(atDoor(s.x, s.z, library)).toBe(true);
    expect(atDoor(4, s.z, library)).toBe(false); // na parede, mas fora do vão
  });
});

describe('saída', () => {
  it('volta ao campus diante da porta (face sul do prédio), olhando para fora e fora da parede', () => {
    const b = campus.buildings.find((x) => x.id === 'biblioteca')!;
    expect(exitPoint(b)).toEqual({ x: 0, z: 2 + 1.5, heading: 0 });
  });

  it('recusa um interior cuja saída cairia dentro de outro prédio', () => {
    const blocked = toCampus({ ...campusData, buildings: [...campusData.buildings, { id: 'banca', labelKey: 'x', position: [0, 3.6], size: [1, 1, 1], color: '#000' }] });
    const problems = interiorProblems(library as Interior, blocked);
    expect(problems.some((p) => p.includes('diante da porta'))).toBe(true);
  });
});
