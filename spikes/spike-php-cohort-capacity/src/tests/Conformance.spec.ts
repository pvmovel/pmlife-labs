// Os casos de conformidade (cases/*.json) no Domain em TypeScript. O php/verify.php roda os mesmos arquivos no espelho
// em PHP: uma regra, dois lados (como os validadores de documento do produto).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseCohort, limitOptions, limitProblem, type CohortChoice, type CohortRow } from '@domain/CohortCapacity';

type Case =
  | { description: string; kind: 'limit'; checks: [number, number, string | null][] }
  | { description: string; kind: 'options'; checks: [number, number[]][] }
  | { description: string; kind: 'choose'; now: string; courseLimit: number; ceiling: number; cohorts: CohortRow[]; expect: CohortChoice };

const dir = path.resolve(import.meta.dirname, '..', '..', 'cases');
const cases = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => [f, JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Case] as const);

describe('casos de conformidade (os mesmos do PHP)', () => {
  it('há casos de limite, de seletor e de escolha da turma', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  for (const [file, c] of cases) {
    it(`${file}: ${c.description}`, () => {
      if (c.kind === 'limit') for (const [limit, ceiling, problem] of c.checks) expect(limitProblem(limit, ceiling), `${limit} com teto ${ceiling}`).toBe(problem);
      else if (c.kind === 'options') for (const [ceiling, options] of c.checks) expect(limitOptions(ceiling)).toEqual(options);
      else expect(chooseCohort(c.cohorts, c.now, c.courseLimit, c.ceiling)).toEqual(c.expect);
    });
  }
});
