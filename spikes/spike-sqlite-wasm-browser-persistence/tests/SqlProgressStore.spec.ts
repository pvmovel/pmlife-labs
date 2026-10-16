import { describe, expect, it } from 'vitest';
import { migrate } from '../src/Infrastructure/localSchema';
import { SqlProgressStore } from '../src/Infrastructure/SqlProgressStore';
import { InMemoryProgressRepository } from '../src/Infrastructure/InMemoryProgressRepository';
import { memoryDb } from './sqlite';

const store = () => {
  const db = memoryDb();
  migrate(db);
  return new SqlProgressStore(db);
};

describe('SqlProgressStore', () => {
  it('trilha sem progresso: null', () => {
    expect(store().load('culinaria')).toBeNull();
  });

  it('grava e lê o mesmo snapshot, com as missões na ordem de conclusão', () => {
    const s = store();
    s.save({ trackId: 'culinaria', xp: 300, completedMissions: ['m2', 'm1'] });
    expect(s.load('culinaria')).toEqual({ trackId: 'culinaria', xp: 300, completedMissions: ['m2', 'm1'] });
  });

  it('gravar de novo substitui (upsert), sem misturar trilhas', () => {
    const s = store();
    s.save({ trackId: 'culinaria', xp: 150, completedMissions: ['m1'] });
    s.save({ trackId: 'idiomas', xp: 50, completedMissions: ['a1'] });
    s.save({ trackId: 'culinaria', xp: 450, completedMissions: ['m1', 'm2', 'm3'] });

    expect(s.load('culinaria')?.xp).toBe(450);
    expect(s.load('culinaria')?.completedMissions).toEqual(['m1', 'm2', 'm3']);
    expect(s.load('idiomas')).toEqual({ trackId: 'idiomas', xp: 50, completedMissions: ['a1'] });
  });

  it('gravação inválida (XP negativo) não deixa nada pela metade', () => {
    const s = store();
    s.save({ trackId: 'culinaria', xp: 150, completedMissions: ['m1'] });
    expect(() => s.save({ trackId: 'culinaria', xp: -1, completedMissions: ['m1', 'm2'] })).toThrow();
    expect(s.load('culinaria')).toEqual({ trackId: 'culinaria', xp: 150, completedMissions: ['m1'] });
  });

  it('clear apaga tudo', () => {
    const s = store();
    s.save({ trackId: 'culinaria', xp: 150, completedMissions: ['m1'] });
    s.clear();
    expect(s.load('culinaria')).toBeNull();
  });
});

describe('InMemoryProgressRepository (fallback sem OPFS)', () => {
  it('cumpre o mesmo Port e devolve cópias', async () => {
    const repo = new InMemoryProgressRepository();
    const snapshot = { trackId: 't', xp: 10, completedMissions: ['m1'] };
    await repo.save(snapshot);
    const loaded = await repo.load('t');
    expect(loaded).toEqual(snapshot);
    expect(loaded).not.toBe(snapshot);
    expect(await repo.load('outra')).toBeNull();
  });
});
