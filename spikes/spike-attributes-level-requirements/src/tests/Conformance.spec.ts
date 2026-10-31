// Os casos de conformidade (cases/*.json), os mesmos que o php/verify.php roda no servidor.
import { describe, expect, it } from 'vitest';
import { evaluate, loadCases } from './conformance';

const cases = loadCases();

describe('casos de conformidade (os mesmos no PHP)', () => {
  it('tem os 3 cenários do Gherkin', () => {
    expect(cases.map(([, c]) => c.gherkin).filter(Boolean)).toEqual(['Nível exige atributo', 'Fase com pré-requisito', 'Versão nova no meio da fase']);
  });

  it.each(cases)('%s', (_, c) => {
    expect(evaluate(c)).toEqual(c.expect);
  });
});
