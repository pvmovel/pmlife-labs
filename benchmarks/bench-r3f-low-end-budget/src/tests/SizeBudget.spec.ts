import { describe, expect, it } from 'vitest';
import { checkSizes, describeViolation, ruleFor, type SizeBudgetConfig } from '../Domain/SizeBudget';
import budget from '../../budget.json';

const config = budget.size as SizeBudgetConfig;
const KB = 1024;

describe('a trava de tamanho do CI (US56)', () => {
  it('cada extensão cai na regra dela', () => {
    expect(ruleFor('assets/cidade-a1b2.glb', config.rules)?.name).toBe('modelo-3d');
    expect(ruleFor('assets/inter-x.WOFF2', config.rules)?.name).toBe('fonte');
    expect(ruleFor('assets/index-x.js', config.rules)?.name).toBe('chunk-js');
    expect(ruleFor('assets/x.css', config.rules)).toBeNull();
  });

  it('dentro do orçamento, nenhuma violação', () => {
    expect(checkSizes([{ path: 'assets/cidade.glb', gzipBytes: 300 * KB, initial: false }, { path: 'assets/index.js', gzipBytes: 120 * KB, initial: true }], config)).toEqual([]);
  });

  it('Cenário: modelo novo acima do limite barra o PR, com o arquivo e o limite', () => {
    const [v] = checkSizes([{ path: 'assets/predio-novo.glb', gzipBytes: 1800 * KB, initial: false }], config);
    expect(v).toEqual({ file: 'assets/predio-novo.glb', rule: 'modelo-3d', kb: 1800, limitKB: 1024 });
    expect(describeViolation(v)).toBe('assets/predio-novo.glb: 1800 KB com gzip, acima do limite de 1024 KB (regra modelo-3d)');
  });

  it('o bundle inicial soma só o que o index.html carrega', () => {
    const files = [
      { path: 'assets/a.js', gzipBytes: 300 * KB, initial: true },
      { path: 'assets/b.js', gzipBytes: 200 * KB, initial: true },
      { path: 'assets/cena.js', gzipBytes: 390 * KB, initial: false },
    ];
    expect(checkSizes(files, config)).toEqual([{ file: '(bundle inicial)', rule: 'initial', kb: 500, limitKB: config.initialKB }]);
  });
});
