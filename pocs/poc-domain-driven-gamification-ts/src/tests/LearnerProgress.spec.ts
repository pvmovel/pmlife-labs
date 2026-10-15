import { describe, expect, it } from 'vitest';
import { CareerLadder } from '../Domain/CareerLadder';
import { LearnerProgress } from '../Domain/LearnerProgress';
import culinaria from '../Content/culinaria.json';
import idiomas from '../Content/idiomas.json';

const cooking = new CareerLadder(culinaria.trackId, culinaria.levels);
const languages = new CareerLadder(idiomas.trackId, idiomas.levels);

describe('LearnerProgress', () => {
  it('promoção nível a nível: 0 ➔ 3000 XP passa por Cozinheiro e chega a Sous-chef, em ordem', () => {
    const p = new LearnerProgress('u1', cooking);
    const promotion = p.addExperience(3000);
    expect(p.level.id).toBe('sous-chef');
    expect(promotion).toMatchObject({ from: { id: 'ajudante' }, to: { id: 'sous-chef' }, levelsGained: 2 });
    expect(promotion.promotions.map((l) => l.id)).toEqual(['cozinheiro', 'sous-chef']);
  });

  it('rejeita XP inválido e id vazio', () => {
    const p = new LearnerProgress('u1', cooking);
    expect(() => p.addExperience(0)).toThrow();
    expect(() => p.addExperience(-10)).toThrow();
    expect(() => p.addExperience(Number.NaN)).toThrow();
    expect(() => new LearnerProgress('  ', cooking)).toThrow();
    expect(() => new LearnerProgress('u1', cooking, -1)).toThrow();
  });

  it('concluir a mesma missão de novo não soma XP (idempotência)', () => {
    const p = new LearnerProgress('u1', cooking);
    expect(p.completeQuest('molho-base', 800)).not.toBeNull();
    expect(p.completeQuest('molho-base', 800)).toBeNull();
    expect(p.xp).toBe(800);
  });

  it('reidratação: snapshot com 2600 XP e quests [q1, q2] ➔ terceiro nível, q1 não soma de novo', () => {
    const restored = LearnerProgress.restore({ learnerId: 'u1', trackId: 'culinaria', xp: 2600, completedQuests: ['q1', 'q2'] }, cooking);
    expect(restored.level.id).toBe('sous-chef');
    expect(restored.completeQuest('q1', 500)).toBeNull();
    expect(restored.xp).toBe(2600);
  });

  it('round-trip toSnapshot ➔ restore preserva o estado', () => {
    const p = new LearnerProgress('u1', cooking);
    p.completeQuest('mise-en-place', 300);
    p.addExperience(900);
    const again = LearnerProgress.restore(p.toSnapshot(), cooking);
    expect(again.toSnapshot()).toEqual(p.toSnapshot());
    expect(again.level.id).toBe('cozinheiro');
  });

  it('não restaura snapshot de outra trilha', () => {
    expect(() => LearnerProgress.restore({ learnerId: 'u1', trackId: 'culinaria', xp: 10, completedQuests: [] }, languages)).toThrow(/outra|não pode/);
  });

  it('trilha configurável: a mesma entidade segue outra escada sem mudar código', () => {
    const p = new LearnerProgress('u1', languages);
    p.addExperience(2600);
    expect(p.level.id).toBe('b2');
    expect(p.nextLevel?.id).toBe('c1');
    expect(p.progressToNext).toBeCloseTo((2600 - 2500) / (4500 - 2500));
  });
});
