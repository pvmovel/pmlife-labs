import { describe, expect, it } from 'vitest';
import { CareerLadder, InvalidLadderError } from '../Domain/CareerLadder';

const levels = [
  { id: 'n1', label: 'Nível 1', minXp: 0 },
  { id: 'n2', label: 'Nível 2', minXp: 1000 },
  { id: 'n3', label: 'Nível 3', minXp: 2500 },
  { id: 'n4', label: 'Nível 4', minXp: 5000 },
];

describe('CareerLadder', () => {
  const ladder = new CareerLadder('teste', levels);

  it('resolve o nível pelo XP, inclusive nos limites exatos', () => {
    expect(ladder.levelFor(0).id).toBe('n1');
    expect(ladder.levelFor(999).id).toBe('n1');
    expect(ladder.levelFor(1000).id).toBe('n2');
    expect(ladder.levelFor(2499).id).toBe('n2');
    expect(ladder.levelFor(2500).id).toBe('n3');
    expect(ladder.levelFor(99999).id).toBe('n4');
  });

  it('informa o próximo nível e null no topo', () => {
    expect(ladder.nextLevelFor(1200)?.id).toBe('n3');
    expect(ladder.nextLevelFor(5000)).toBeNull();
  });

  it('rejeita escadas inválidas', () => {
    expect(() => new CareerLadder('x', [])).toThrow(InvalidLadderError);
    expect(() => new CareerLadder('x', [{ id: 'a', label: 'A', minXp: 10 }])).toThrow(/começar em 0 XP/);
    expect(() =>
      new CareerLadder('x', [
        { id: 'a', label: 'A', minXp: 0 },
        { id: 'b', label: 'B', minXp: 0 },
      ]),
    ).toThrow(/deve ser maior/);
    expect(() =>
      new CareerLadder('x', [
        { id: 'a', label: 'A', minXp: 0 },
        { id: 'a', label: 'A2', minXp: 10 },
      ]),
    ).toThrow(/repetidos/);
  });
});
