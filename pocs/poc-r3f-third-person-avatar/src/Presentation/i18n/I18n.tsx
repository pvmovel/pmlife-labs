// i18n mínimo da PoC: textos da página e rótulos 3D vêm do mesmo dicionário (a técnica tipada está no spike de i18n).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ptBR from '../../Content/Locales/pt-BR.json';
import enUS from '../../Content/Locales/en-US.json';

export const MESSAGES = { 'pt-BR': ptBR, 'en-US': enUS } as const;
export type Language = keyof typeof MESSAGES;
export type Params = Record<string, string | number>;

export function translate(language: Language, key: string, params?: Params): string {
  let node: unknown = MESSAGES[language];
  for (const part of key.split('.')) node = typeof node === 'object' && node ? (node as Record<string, unknown>)[part] : undefined;
  if (typeof node !== 'string') return key;
  return params ? node.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : node;
}

interface I18nValue {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initial = 'pt-BR' }: { children: ReactNode; initial?: Language }) {
  const [language, setLanguage] = useState<Language>(initial);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string, params?: Params) => translate(language, key, params) }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n fora do I18nProvider');
  return value;
}
