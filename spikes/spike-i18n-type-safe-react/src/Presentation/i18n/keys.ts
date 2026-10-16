// Tipos das chaves: todos os caminhos até uma folha string, ex.: 'footer.release.title'.
import type { Messages } from './messages';

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Toda chave de tradução válida. `t('footer.inexistente')` não compila. */
export type TranslationKey = Paths<Messages>;

/** Parâmetros de interpolação: `{name}` no texto ➔ `{ name: 'Ana' }`. */
export type TranslationParams = Record<string, string | number>;
