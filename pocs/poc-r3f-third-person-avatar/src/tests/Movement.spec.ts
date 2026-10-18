import { describe, expect, it } from 'vitest';
import { toCampus, type Campus } from '../Domain/Campus';
import { DEFAULT_MOVEMENT, startIsFree, step, type AvatarState, type MoveInput } from '../Domain/Movement';
import campusData from '../Content/campus.json';

const campus = toCampus(campusData);

const NONE: MoveInput = { forward: false, backward: false, left: false, right: false };
const press = (keys: Partial<MoveInput>): MoveInput => ({ ...NONE, ...keys });
const empty: Campus = { halfSize: 15, start: { x: 0, z: 0, heading: 0 }, buildings: [] };
const DT = 1 / 60;

/** Segura as teclas por `seconds`, a 60 quadros por segundo. */
const hold = (s: AvatarState, input: MoveInput, seconds: number, map: Campus = empty) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) s = step(s, input, DT, map);
  return s;
};

describe('movimento do avatar (Gherkin: deslocar na direção da tecla)', () => {
  it('W anda para a frente, na direção para onde o avatar olha', () => {
    const s = hold({ x: 0, z: 0, heading: 0 }, press({ forward: true }), 1);
    expect(s.x).toBeCloseTo(0);
    expect(s.z).toBeCloseTo(DEFAULT_MOVEMENT.speed);
  });

  it('S anda para trás', () => {
    const s = hold({ x: 0, z: 0, heading: Math.PI / 2 }, press({ backward: true }), 0.5);
    expect(s.x).toBeCloseTo(-3);
    expect(s.z).toBeCloseTo(0);
  });

  it('A gira para a esquerda e D para a direita, sem sair do lugar', () => {
    const left = hold({ x: 1, z: 1, heading: 0 }, press({ left: true }), 1);
    const right = hold({ x: 1, z: 1, heading: 0 }, press({ right: true }), 1);
    expect(left.heading).toBeCloseTo(DEFAULT_MOVEMENT.turnSpeed);
    expect(right.heading).toBeCloseTo(-DEFAULT_MOVEMENT.turnSpeed);
    expect([left.x, left.z]).toEqual([1, 1]);
  });

  it('frente e trás juntas se anulam', () => {
    expect(step({ x: 0, z: 0, heading: 0 }, press({ forward: true, backward: true }), DT, empty)).toEqual({ x: 0, z: 0, heading: 0 });
  });
});

describe('limites e colisão (Gherkin: não atravessa prédios nem sai do mapa)', () => {
  it('não sai do mapa: para na borda menos a largura do avatar', () => {
    const s = hold({ x: 0, z: 0, heading: 0 }, press({ forward: true }), 10);
    expect(s.z).toBe(empty.halfSize - DEFAULT_MOVEMENT.radius);
  });

  it('para na parede do prédio, sem atravessar', () => {
    // começa em z=10 olhando para -z; a biblioteca ocupa z de -2 a 2
    const s = hold(campus.start, press({ forward: true }), 5, campus);
    expect(s.z).toBeCloseTo(2 + DEFAULT_MOVEMENT.radius);
  });

  it('nem um quadro muito lento (dt enorme) atravessa o prédio', () => {
    const s = step(campus.start, press({ forward: true }), 5, campus);
    expect(s.z).toBeGreaterThanOrEqual(2 + DEFAULT_MOVEMENT.radius);
  });

  it('encostar em diagonal desliza pela parede em vez de travar', () => {
    const start = { x: 0, z: 2.5, heading: Math.PI + Math.PI / 4 }; // contra a parede, andando na diagonal
    const s = hold(start, press({ forward: true }), 0.5, campus);
    expect(s.z).toBeCloseTo(2.5); // não entrou no prédio
    expect(s.x).toBeLessThan(-1); // mas andou ao longo da parede
  });

  it('conteúdo malformado falha com a mensagem do campo errado', () => {
    expect(() => toCampus({ ...campusData, buildings: [{ ...campusData.buildings[0], position: [1] }] })).toThrow('biblioteca.position precisa ser [x, z]');
  });

  it('o ponto de partida do conteúdo é livre e está dentro do mapa', () => {
    expect(startIsFree(campus)).toBe(true);
    expect(startIsFree({ ...campus, start: { x: 0, z: 0, heading: 0 } })).toBe(false);
  });
});
