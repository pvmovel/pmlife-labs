// O Domain da US48 além dos casos de conformidade: o teto inválido também é recusado, o seletor sem teto vai até 48, o
// limite efetivo nunca passa do teto e a escolha não muda as turmas recebidas.
import { describe, expect, it } from 'vitest';
import { COHORT_DEFAULT, COHORT_MAX, chooseCohort, effectiveCapacity, isOpen, limitOptions, limitProblem, nextSlug, type CohortRow } from '@domain/CohortCapacity';

const NOW = '2026-11-06 12:00:00';
const row = (over: Partial<CohortRow> = {}): CohortRow => ({ id: 1, slug: 'turma-1', startsAt: '2026-01-01 00:00:00', endsAt: null, capacity: 12, enrolled: 0, ...over });

describe('US48: o limite da turma', () => {
  it('o padrão é 12, e o próprio teto passa pela mesma regra (múltiplo de 4, de 4 a 48)', () => {
    expect(COHORT_DEFAULT).toBe(12);
    expect(limitProblem(COHORT_DEFAULT)).toBeNull();
    expect(limitProblem(50)).toBe('COHORT_LIMIT_INVALID');
    expect(limitProblem(12.5)).toBe('COHORT_LIMIT_INVALID');
  });

  it('sem teto (ou com um teto inválido), o seletor vai de 4 a 48', () => {
    expect(limitOptions()).toHaveLength(COHORT_MAX / 4);
    expect(limitOptions(10)).toEqual(limitOptions());
  });

  it('o limite efetivo nunca passa do teto atual', () => {
    expect(effectiveCapacity(16, 12)).toBe(12);
    expect(effectiveCapacity(8, 12)).toBe(8);
  });
});

describe('US48: a turma de quem entra agora', () => {
  it('aberta é a que começou, não acabou e não lotou', () => {
    expect(isOpen(row(), NOW, 12)).toBe(true);
    expect(isOpen(row({ enrolled: 12 }), NOW, 12)).toBe(false);
    expect(isOpen(row({ endsAt: NOW }), NOW, 12)).toBe(false);
    expect(isOpen(row({ startsAt: '2026-11-06 12:00:01' }), NOW, 12)).toBe(false);
  });

  it('a turma seguinte se chama turma-N, sem repetir um nome', () => {
    expect(nextSlug([])).toBe('turma-1');
    expect(nextSlug(['padrao'])).toBe('turma-2');
    expect(nextSlug(['turma-1', 'turma-2', 'turma-3'])).toBe('turma-4');
  });

  it('a escolha não mexe nas turmas recebidas', () => {
    const cohorts = Object.freeze([row({ id: 2, startsAt: '2026-02-01 00:00:00' }), row({ id: 1 })]);
    expect(chooseCohort(cohorts, NOW, 12, 12)).toEqual({ kind: 'existing', id: 2, slug: 'turma-1' });
    expect(cohorts.map((c) => c.id)).toEqual([2, 1]);
  });
});
