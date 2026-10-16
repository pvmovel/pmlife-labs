// Paridade em tempo de execução: as mesmas chaves (e só folhas string) em todos os idiomas.
import { describe, expect, it } from 'vitest';
import { LANGUAGES, MESSAGES } from '../Presentation/i18n/messages';

function leafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (typeof node !== 'object' || node === null) throw new Error(`Valor inválido em "${prefix}"`);
  return Object.entries(node).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe('Paridade de chaves entre idiomas', () => {
  const reference = leafPaths(MESSAGES['pt-BR']).sort();

  it.each(LANGUAGES.filter((l) => l !== 'pt-BR'))('%s tem exatamente as chaves do pt-BR', (language) => {
    expect(leafPaths(MESSAGES[language]).sort()).toEqual(reference);
  });

  it('nenhum texto vazio', () => {
    for (const language of LANGUAGES) {
      for (const path of leafPaths(MESSAGES[language])) {
        const value = path.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], MESSAGES[language]);
        expect(String(value).trim(), `${language}:${path}`).not.toBe('');
      }
    }
  });

  it('os mesmos parâmetros de interpolação nos dois idiomas', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    expect(params(MESSAGES['en-US'].common.greeting)).toEqual(params(MESSAGES['pt-BR'].common.greeting));
  });
});
