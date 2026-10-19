import { describe, expect, it } from 'vitest';
import { toCampus, type Building, type Campus } from '../Domain/Campus';
import { toNpcs, type Npc } from '../Domain/Npc';
import { DEFAULT_INTERACTION_RADIUS, DEFAULT_NPC_RADIUS, distanceToBuilding, distanceToNpc, nearestInteractable } from '../Domain/Proximity';
import npcsData from '../Content/npcs.json';
import campusData from '../Content/campus.json';

const campus = toCampus(campusData);
const npcs = toNpcs(npcsData, campus);
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
    expect(nearestInteractable(0, 2 + DEFAULT_INTERACTION_RADIUS - 0.01, map([box()]))?.id).toBe('a');
    expect(nearestInteractable(0, 2 + DEFAULT_INTERACTION_RADIUS + 0.01, map([box()]))).toBeNull();
  });

  it('o raio vem do conteúdo de cada prédio', () => {
    expect(nearestInteractable(0, 7, map([box({ interactionRadius: 6 })]))?.distance).toBe(5);
  });

  it('com dois prédios no alcance, vence o mais perto', () => {
    const m = map([box({ id: 'esq', position: [-4, 0] }), box({ id: 'dir', position: [4, 0] })]);
    expect(nearestInteractable(0.5, 0, m)?.id).toBe('dir');
  });

  it('no campus da demo: longe no ponto de partida, perto ao encostar na Biblioteca', () => {
    expect(nearestInteractable(campus.start.x, campus.start.z, campus)).toBeNull();
    expect(nearestInteractable(0, 2.5, campus)?.id).toBe('biblioteca');
  });

  it('o resultado diz se é prédio ou NPC', () => {
    expect(nearestInteractable(0, 2.5, campus)).toMatchObject({ kind: 'building', id: 'biblioteca' });
  });

  it('raio inválido no JSON é recusado', () => {
    expect(() => toCampus({ ...campusData, buildings: [{ ...campusData.buildings[0], interactionRadius: 0 }] })).toThrow('interactionRadius precisa ser positivo');
  });
});

const npc = (over: Partial<Npc> = {}): Npc => ({ id: 'n', labelKey: 'k', persona: 'p', position: [0, 6], color: '#123456', ...over });

describe('NPCs no alcance (US22b)', () => {
  it('a distância é medida até o corpo do NPC', () => {
    expect(distanceToNpc(0, 9, npc())).toBeCloseTo(2.6); // 3 do centro menos o corpo (0,4)
    expect(distanceToNpc(0, 6.2, npc())).toBe(0);
  });

  it('dentro do raio padrão de 2 m aparece; fora, não', () => {
    expect(nearestInteractable(0, 6 + 0.4 + DEFAULT_NPC_RADIUS - 0.01, map([]), [npc()])).toMatchObject({ kind: 'npc', id: 'n' });
    expect(nearestInteractable(0, 6 + 0.4 + DEFAULT_NPC_RADIUS + 0.01, map([]), [npc()])).toBeNull();
  });

  it('entre um prédio e um NPC no alcance, vence o mais perto', () => {
    const m = map([box()]); // parede em z = 2
    expect(nearestInteractable(0, 4.5, m, [npc()])?.kind).toBe('npc'); // 1,1 do NPC × 2,5 da parede
    expect(nearestInteractable(0, 3, m, [npc()])?.kind).toBe('building'); // 1 da parede × 2,6 do NPC
  });

  it('no campus da demo: nada no ponto de partida; andando em frente, o Guia do Museu aparece antes da Biblioteca', () => {
    expect(nearestInteractable(campus.start.x, campus.start.z, campus, npcs)).toBeNull();
    expect(nearestInteractable(0, 9, campus, npcs)).toMatchObject({ kind: 'npc', id: 'guia' });
  });
});
