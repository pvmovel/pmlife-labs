import { describe, expect, it } from 'vitest';
import { toCampus, type Building, type Campus } from '../Domain/Campus';
import { DEFAULT_INTERACTION_RADIUS, distanceToBuilding, nearestInteractable } from '../Domain/Proximity';
import campusData from '../Content/campus.json';

const campus = toCampus(campusData);
const box = (over: Partial<Building> = {}): Building => ({ id: 'a', labelKey: 'k', position: [0, 0], size: [4, 2, 4], color: '#123456', ...over });
const map = (buildings: Building[]): Campus => ({ halfSize: 15, start: { x: 0, z: 0, heading: 0 }, buildings });

describe('distância até o prédio (medida até a parede)', () => {
  it('de frente para a parede, de canto e dentro', () => {
    expect(distanceToBuilding(0, 5, box())).toBe(3); // parede em z = 2
    expect(distanceToBuilding(5, 5, box())).toBeCloseTo(Math.hypot(3, 3)); // canto (2, 2)
    expect(distanceToBuilding(1, 1, box())).toBe(0);
  });
});

describe('nearestInteractable (Gherkin: aviso ao entrar no raio)', () => {
  it('dentro do raio padrão de 3 aparece; fora, não', () => {
    expect(nearestInteractable(0, 2 + DEFAULT_INTERACTION_RADIUS - 0.01, map([box()]))?.building.id).toBe('a');
    expect(nearestInteractable(0, 2 + DEFAULT_INTERACTION_RADIUS + 0.01, map([box()]))).toBeNull();
  });

  it('o raio vem do conteúdo de cada prédio', () => {
    expect(nearestInteractable(0, 7, map([box({ interactionRadius: 6 })]))?.distance).toBe(5);
  });

  it('com dois prédios no alcance, vence o mais perto', () => {
    const m = map([box({ id: 'esq', position: [-4, 0] }), box({ id: 'dir', position: [4, 0] })]);
    expect(nearestInteractable(0.5, 0, m)?.building.id).toBe('dir');
  });

  it('no campus da demo: longe no ponto de partida, perto ao encostar na Biblioteca', () => {
    expect(nearestInteractable(campus.start.x, campus.start.z, campus)).toBeNull();
    expect(nearestInteractable(0, 2.5, campus)?.building.id).toBe('biblioteca');
  });

  it('raio inválido no JSON é recusado', () => {
    expect(() => toCampus({ ...campusData, buildings: [{ ...campusData.buildings[0], interactionRadius: 0 }] })).toThrow('interactionRadius precisa ser positivo');
  });
});
