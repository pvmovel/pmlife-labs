// i18n sem biblioteca: Context + t() tipado. O idioma escolhido fica no localStorage
// e é refletido em <html lang> (acessibilidade, leitores de tela e SEO).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TranslationKey, TranslationParams } from './keys';
import { LANGUAGES, MESSAGES, type Language, type Messages } from './messages';

const STORAGE_KEY = 'labs_lang';

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Busca o texto pelo caminho; como as chaves são tipadas, só cai no fallback se o JSON mudar sem rebuild. */
export function translate(messages: Messages, key: TranslationKey, params?: TranslationParams): string {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== 'string') return key;
  return params ? node.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : node;
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGUAGES as readonly string[]).includes(saved)) return saved as Language;
  } catch {
    // localStorage indisponível (modo privado): segue o padrão.
  }
  return 'pt-BR';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignora: a troca vale para a sessão
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t: (key, params) => translate(MESSAGES[language], key, params) }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de <I18nProvider>');
  return ctx;
}
