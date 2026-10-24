// O mapa do repositório vira dado público: leitura dos blocos, camadas, árvore, números e a sanitização que falha fechada.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertNoLeaks, buildTree, layerOf, LeakError, mapStats, parseStructureMap, sanitizeEntry } from '../src/lib/structureMap';
import { FORBIDDEN, SANITIZE_RULES } from '../src/data/sanitize';

const raw = readFileSync(new URL('../fixtures/ESTRUTURA.md', import.meta.url), 'utf8');
const entries = parseStructureMap(raw);
const texts = (es: typeof entries) => es.flatMap((e) => [e.description, e.descriptionEn ?? '', e.origin ?? '']);

describe('leitura do mapa', () => {
  it('um bloco por arquivo, com função, inglês, exports, quem usa, origem e conformidade', () => {
    expect(entries).toHaveLength(16);
    const uc = entries.find((e) => e.path === 'src/Application/UseCases/RegistrarColheitaUseCase.ts')!;
    expect(uc).toMatchObject({
      description: 'Caso de uso: registra a colheita no canteiro e grava pelo Port.',
      descriptionEn: 'Use case: records the harvest on the garden bed and saves it through the Port.',
      exports: ['RegistrarColheitaUseCase'],
      usedBy: ['src/Presentation/di/Dependencias.tsx', 'src/tests/Application/RegistrarColheita.spec.ts'],
      origin: 'd4e5f6a (2026-01-15) feat(app): registrar colheita (#5)',
      conformity: 'ok',
      layer: 'application',
    });
    expect(entries.find((e) => e.path === 'src/Infrastructure/Adapters/HttpCanteiroRepository.ts')?.conformity).toBe('finding');
    expect(entries.find((e) => e.path === 'src/Content/culturas.json')?.conformity).toBeUndefined();
  });

  it('títulos de seção e textos entre crases fora do título não viram arquivos', () => {
    expect(entries.map((e) => e.path)).not.toContain('src/Domain/');
    expect(parseStructureMap('## `src/`\n\ntexto com `src/x.ts`\n')).toEqual([]);
  });
});

describe('camadas', () => {
  it.each([
    ['src/Domain/Entities/Canteiro.ts', 'domain'],
    ['src/Application/Ports/CanteiroRepository.ts', 'application'],
    ['src/Infrastructure/Adapters/HttpCanteiroRepository.ts', 'infrastructure'],
    ['src/Presentation/di/Dependencias.tsx', 'composition-root'],
    ['src/Presentation/app.tsx', 'presentation'],
    ['src/Content/culturas.json', 'content'],
    ['src/tests/Domain/Canteiro.spec.ts', 'tests'],
    ['backend/api/canteiros.php', 'backend'],
    ['php_backend/src/Auth/Csrf.php', 'backend'],
    ['docs/architecture/ADRS.md', 'docs'],
    ['vite.config.ts', 'delivery'],
  ])('%s ➔ %s', (path, layer) => expect(layerOf(path)).toBe(layer));
});

describe('árvore do explorador', () => {
  it('pastas antes de arquivos, em ordem alfabética, com o caminho de cada nó', () => {
    const tree = buildTree(['src/b.ts', 'src/A/x.ts', 'a.json', 'src/a.ts']);
    expect(tree.children!.map((c) => c.path)).toEqual(['src/', 'a.json']);
    expect(tree.children![0].children!.map((c) => c.path)).toEqual(['src/A/', 'src/a.ts', 'src/b.ts']);
  });
});

describe('sanitização', () => {
  it('o mapa cru tem conteúdo sensível, e a trava o pega', () => {
    expect(() => assertNoLeaks(texts(entries), FORBIDDEN)).toThrow(LeakError);
  });

  it('depois das regras não sobra nada, e cada idioma ganha o seu texto genérico', () => {
    const clean = entries.map((e) => sanitizeEntry(e, SANITIZE_RULES));
    expect(() => assertNoLeaks(texts(clean), FORBIDDEN)).not.toThrow();
    const endpoint = clean.find((e) => e.path === 'backend/api/canteiros.php')!;
    expect(endpoint.description).toContain('[arquivo de ambiente]');
    expect(endpoint.description).toContain('[pasta do servidor]');
    expect(endpoint.descriptionEn).toContain('[environment file]');
    expect(clean.find((e) => e.path === 'backend/src/CanteiroRepository.php')!.description).toContain('[credencial]');
  });

  it('o caminho e os exports não mudam (o explorador continua navegável)', () => {
    const clean = entries.map((e) => sanitizeEntry(e, SANITIZE_RULES));
    expect(clean.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    expect(clean.map((e) => e.exports)).toEqual(entries.map((e) => e.exports));
  });
});

describe('números do projeto', () => {
  it('conta arquivos, camadas, exports e conformidade', () => {
    const s = mapStats(entries);
    expect(s).toMatchObject({ files: 16, conformant: 12, withFindings: 1 });
    expect(s.byLayer).toMatchObject({ domain: 3, application: 2, infrastructure: 1, 'composition-root': 1, presentation: 2, content: 1, tests: 2, backend: 2, delivery: 2 });
    expect(s.exports).toBe(11);
  });
});
