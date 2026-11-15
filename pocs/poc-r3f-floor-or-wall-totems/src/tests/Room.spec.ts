// O domínio da US75: o objeto no chão ou na parede, o limite de 5 por parede (quadros e totens somam, o chão não), o
// corredor da porta, a passagem livre até cada estação e cada totem, a sala nova de 18 m e o documento de antes, que
// continua igual. Os cenários do Gherkin estão marcados.
import { describe, expect, it } from 'vitest';
import roomData from '../Content/room.json';
import { applyRoom, floorBox, freeOffset, movePlacement, NEW_ROOM, placementOf, replaceItem, roomAsCampus, roomProblems, toRoom, WALL_ITEMS_PER_WALL, type Room, type RoomItem, type Wall } from '../Domain/Room';

const SAMPLE = toRoom(roomData);
const item = (id: string) => SAMPLE.items.find((i) => i.id === id) as RoomItem;
const codes = (room: Room) => roomProblems(room).map((p) => `${p.code}@${p.itemId}`);
const board = (id: string, wall: Wall, offset: number): RoomItem => ({ id, kind: 'board', textKey: 'items.novo', width: 2.4, wall, offset });
const empty: Room = { ...NEW_ROOM, stations: [], items: [] };

describe('US75: no chão ou na parede', () => {
  it('a sala de exemplo é válida: a parede norte cheia (3 quadros e 2 totens) e a placa de aviso no chão', () => {
    expect(codes(SAMPLE)).toEqual([]);
    expect(SAMPLE.items.filter((i) => placementOf(i) === 'wall' && i.wall === 'north')).toHaveLength(5);
    expect(placementOf(item('placa-boas-vindas'))).toBe('floor');
  });

  it('Gherkin "Totem de vídeo no chão": no meio da sala, virado para a porta, continua sendo um alvo com raio de interação', () => {
    const floor = movePlacement(item('aula-1'), 'floor');
    expect(floor).toMatchObject({ placement: 'floor', x: 0, z: 0, facing: 'south' });
    expect(floor).not.toHaveProperty('wall');
    const r = applyRoom(replaceItem(SAMPLE, floor));
    expect(r.ok).toBe(true);
    const target = roomAsCampus(r.ok ? r.room : SAMPLE).buildings.find((b) => b.id === 'aula-1');
    expect(target).toMatchObject({ position: [0, 0], interactionRadius: 1.6 });
  });

  it('Gherkin "Quadro de texto como placa de aviso no chão": o quadro vira obstáculo no chão, com o mesmo texto', () => {
    const sign = movePlacement(item('quadro-aviso'), 'floor');
    const r = applyRoom(replaceItem(SAMPLE, { ...sign, x: 2, z: 3 }));
    expect(r.ok).toBe(true);
    const obstacle = roomAsCampus(r.ok ? r.room : SAMPLE).buildings.find((b) => b.id === 'sign:quadro-aviso');
    expect(obstacle).toMatchObject({ labelKey: 'items.aviso', position: [2, 3] });
    expect(obstacle?.interactionRadius).toBeLessThan(0); // a placa é só obstáculo: não é alvo, como o quadro de parede
  });

  it('Gherkin "Sexto quadro na mesma parede": recusado apontando a parede norte, e a sala de antes continua', () => {
    const next = { ...SAMPLE, items: [...SAMPLE.items, board('sexto', 'north', 7)] };
    const r = applyRoom(next);
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.problems).toContainEqual({ code: 'WALL_ITEMS_TOO_MANY', itemId: 'sexto', wall: 'north' });
  });

  it('o que fica no chão não conta na parede: com o totem da norte no chão, cabe mais um quadro', () => {
    const floor = { ...movePlacement(item('aula-1'), 'floor'), x: 0, z: 1 };
    const next = { ...replaceItem(SAMPLE, floor), items: [...replaceItem(SAMPLE, floor).items, board('sexto', 'north', -6)] };
    expect(codes(next)).toEqual([]);
  });

  it('Gherkin "Objeto no chão na frente da porta": recusado apontando o totem', () => {
    const totem = { ...movePlacement(item('aula-1'), 'floor'), x: NEW_ROOM.doorX, z: 7 };
    expect(codes(replaceItem(SAMPLE, totem))).toContain('FLOOR_ITEM_BLOCKS_DOOR@aula-1');
  });

  it('no chão: fora da sala e sobre uma mesa são recusados', () => {
    expect(codes(replaceItem(SAMPLE, { ...movePlacement(item('aula-1'), 'floor'), x: 8.9 }))).toContain('FLOOR_ITEM_OUTSIDE@aula-1');
    expect(codes(replaceItem(SAMPLE, { ...movePlacement(item('aula-1'), 'floor'), x: -4, z: -3 }))).toContain('FLOOR_ITEMS_OVERLAP@aula-1');
  });

  it('a passagem livre: uma barreira de placas que fecha a mesa é recusada, apontando a mesa sem caminho', () => {
    // Uma "parede" de 7 placas de 2,5 m, de parede a parede na altura z = 1 (frestas de 5 cm), separa a porta (sul) das
    // mesas (norte). Uma fresta de 1,1 m na ponta já deixaria o avatar (1 m) passar.
    const wall = [-7.65, -5.1, -2.55, 0, 2.55, 5.1, 7.65].map((x, k): RoomItem => ({ id: `barreira-${k}`, kind: 'board', textKey: 'items.novo', width: 2.5, placement: 'floor', x, z: 1, facing: 'south' }));
    const problems = roomProblems({ ...SAMPLE, items: [...SAMPLE.items, ...wall] });
    expect(problems.some((p) => p.code === 'FLOOR_ITEM_BLOCKS_PATH' && p.target === 'mesa-leitura')).toBe(true);
    // Sem a placa do meio (uma brecha de 2,6 m), o avatar passa: nada a recusar.
    expect(roomProblems({ ...SAMPLE, items: [...SAMPLE.items, ...wall.filter((_, k) => k !== 3)] }).filter((p) => p.code === 'FLOOR_ITEM_BLOCKS_PATH')).toEqual([]);
  });

  it('Gherkin "Sala nova com paredes maiores": 18 m, e cada parede aceita 5 quadros de 2,4 m, inclusive a da porta', () => {
    expect(NEW_ROOM.halfSize * 2).toBe(18);
    let room: Room = empty;
    for (const wall of ['north', 'east', 'south', 'west'] as const) {
      for (let k = 0; k < WALL_ITEMS_PER_WALL; k++) room = { ...room, items: [...room.items, board(`${wall}-${k}`, wall, freeOffset(room, wall, 2.4))] };
    }
    expect(codes(room)).toEqual([]);
    expect(room.items.filter((i) => i.wall === 'south')).toHaveLength(5);
    const sixth = { ...room, items: [...room.items, board('sul-6', 'south', freeOffset(room, 'south', 2.4))] };
    expect(codes(sixth)).toContain('WALL_ITEMS_TOO_MANY@sul-6');
  });

  it('Gherkin "Documento de antes continua igual": sem placement, tudo fica na mesma parede e na mesma posição', () => {
    const before = toRoom({ halfSize: 6, doorX: 0, stations: [], items: [{ id: 'q', kind: 'board', wall: 'east', offset: 1, width: 2, textKey: 'items.aviso' }] });
    expect(before.items[0]).toEqual({ id: 'q', kind: 'board', wall: 'east', offset: 1, width: 2, textKey: 'items.aviso' });
    expect(placementOf(before.items[0])).toBe('wall');
  });

  it('no chão, a largura fica de lado para a frente: virado para leste, ocupa 0,5 m em x e a largura em z', () => {
    expect(floorBox({ id: 'p', kind: 'board', textKey: 'x', width: 2, placement: 'floor', x: 0, z: 0, facing: 'east' })).toEqual({ minX: -0.25, maxX: 0.25, minZ: -1, maxZ: 1 });
  });

  it('o conteúdo malformado falha ao abrir, com o campo', () => {
    expect(() => toRoom({ ...roomData, items: [{ id: 'x', kind: 'board', textKey: 'k', width: 1, placement: 'floor', x: 0 }] })).toThrow('no chão, x, z e facing');
    expect(() => toRoom({ ...roomData, items: [{ id: 'x', kind: 'board', textKey: 'k', width: 1, placement: 'teto' }] })).toThrow('placement');
  });
});
