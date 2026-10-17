import { describe, expect, it } from 'vitest';
import { validateCity, type Building, type CityDefinition } from '../Domain/City';

const b = (over: Partial<Building> = {}): Building => ({ id: 'a', labelKey: 'k', position: [0, 0], size: [2, 2, 2], color: '#112233', ...over });
const city = (buildings: Building[]): CityDefinition => ({ trackId: 't', labelKey: 'tracks.t', buildings });

describe('validateCity', () => {
  it('cidade coerente: nenhum problema', () => {
    expect(validateCity(city([b(), b({ id: 'b', position: [5, 0] })]))).toEqual([]);
  });

  it('prédio em cima de outro é recusado', () => {
    expect(validateCity(city([b(), b({ id: 'b', position: [1, 1] })]))).toEqual(['a e b se sobrepõem']);
  });

  it('prédios encostados (sem sobrepor) passam', () => {
    expect(validateCity(city([b(), b({ id: 'b', position: [2, 0] })]))).toEqual([]);
  });

  it('erros de digitação no JSON viram mensagens claras', () => {
    const errors = validateCity(city([b({ size: [2, 0, 2], color: 'azul' }), b({ position: [9, 9] })]));
    expect(errors).toEqual([
      'a: dimensões precisam ser positivas',
      'a: cor "azul" fora do formato #rrggbb',
      'id repetido: a',
    ]);
  });

  it('cidade sem prédios é inválida', () => {
    expect(validateCity(city([]))).toContain('a cidade não tem prédios');
  });
});
