// Dicionários por idioma, montados a partir dos namespaces em src/Content/Locales/<idioma>/<namespace>.json.
// O pt-BR é a REFERÊNCIA: as chaves válidas são derivadas dele.
import ptCommon from '../../Content/Locales/pt-BR/common.json';
import ptFooter from '../../Content/Locales/pt-BR/footer.json';
import ptDemo from '../../Content/Locales/pt-BR/demo.json';
import enCommon from '../../Content/Locales/en-US/common.json';
import enFooter from '../../Content/Locales/en-US/footer.json';
import enDemo from '../../Content/Locales/en-US/demo.json';

export const LANGUAGES = ['pt-BR', 'en-US'] as const;
export type Language = (typeof LANGUAGES)[number];

const ptBR = { common: ptCommon, footer: ptFooter, demo: ptDemo };

/** Mesma estrutura do pt-BR, com folhas string: é o "contrato" que todo idioma precisa cumprir. */
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof ptBR>;

/**
 * en-US anotado com `Messages`: se faltar ou sobrar uma chave em relação ao pt-BR,
 * o build NÃO compila (paridade garantida em tempo de compilação, além do teste).
 */
const enUS: Messages = { common: enCommon, footer: enFooter, demo: enDemo };

export const MESSAGES: Record<Language, Messages> = { 'pt-BR': ptBR, 'en-US': enUS };
