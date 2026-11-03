// Idioma do admin: o texto vem sempre por chave (nada fixo na tela), com {variáveis}. A troca muda também o `lang`.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enUS } from '../Content/Locales/en-US';
import { ptBR, type MessageKey } from '../Content/Locales/pt-BR';

export type Language = 'pt-BR' | 'en-US';
const MESSAGES: Record<Language, Record<MessageKey, string>> = { 'pt-BR': ptBR, 'en-US': enUS };

interface I18n {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children, initial = 'pt-BR' }: { children: ReactNode; initial?: Language }) {
  const [language, setLanguage] = useState<Language>(initial);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = MESSAGES[language]['app.title'];
  }, [language]);
  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => MESSAGES[language][key].replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? `{${v}}`)),
    }),
    [language],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n fora do I18nProvider');
  return v;
}

/** Data `AAAA-MM-DD` no formato do idioma. */
export const formatDate = (iso: string, language: Language) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(language);
