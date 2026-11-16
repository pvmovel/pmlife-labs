// Lê o registro e os casos de conformidade (cases/*.json). O php/verify.php faz exatamente o mesmo: o editor
// (TypeScript) e o servidor (PHP) precisam dar os mesmos problemas para o mesmo documento.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRegistry, type Problem, type ToolRegistry } from '@domain/ToolRegistry';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export interface ConformanceCase {
  readonly description: string;
  readonly gherkin?: string;
  /** "base" é o registro da plataforma; "example", o tipo de exemplo dos testes. */
  readonly registries: readonly ('base' | 'example')[];
  readonly room: { readonly buildingId: string; readonly items: readonly unknown[] };
  readonly quests: readonly { readonly id: string; readonly buildingId: string }[];
  readonly texts: readonly string[];
  readonly expect: readonly string[];
}

const FILES = { base: 'src/Content/tool-types.json', example: 'fixtures/example-type.json' } as const;
export const readJson = (rel: string): unknown => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
export const registryOf = (names: readonly ('base' | 'example')[]): ToolRegistry => parseRegistry(...names.map((n) => readJson(FILES[n])));
/** O problema como o caso o escreve: CODIGO(param)@/caminho. */
export const key = (p: Problem): string => `${p.code}${p.param === undefined ? '' : `(${p.param})`}@${p.path}`;

export function loadCases(): [string, ConformanceCase][] {
  const dir = path.join(ROOT, 'cases');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ConformanceCase]);
}
