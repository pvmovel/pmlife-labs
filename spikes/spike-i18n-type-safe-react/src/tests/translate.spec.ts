import { describe, expect, it } from 'vitest';
import { translate } from '../Presentation/i18n/I18nProvider';
import { MESSAGES } from '../Presentation/i18n/messages';
import type { TranslationKey } from '../Presentation/i18n/keys';

describe('translate()', () => {
  it('resolve chaves aninhadas por caminho', () => {
    expect(translate(MESSAGES['pt-BR'], 'footer.release.title')).toBe('Informações da versão');
    expect(translate(MESSAGES['en-US'], 'footer.release.title')).toBe('Release information');
  });

  it('interpola parâmetros', () => {
    expect(translate(MESSAGES['pt-BR'], 'common.greeting', { name: 'Ana', count: 3 })).toBe('Olá, Ana! Você tem 3 missões hoje.');
  });

  it('chave inexistente NÃO compila (o @ts-expect-error falharia o tsc se ela compilasse)', () => {
    // @ts-expect-error 'footer.relase.title' não é uma TranslationKey (erro de digitação)
    const typo: TranslationKey = 'footer.relase.title';
    // @ts-expect-error namespace inteiro não é uma folha de texto
    const notALeaf: TranslationKey = 'footer.release';
    // Em execução (ex.: JSON alterado sem rebuild), o fallback devolve a própria chave em vez de quebrar.
    expect(translate(MESSAGES['pt-BR'], typo)).toBe('footer.relase.title');
    expect(translate(MESSAGES['pt-BR'], notALeaf)).toBe('footer.release');
  });
});
