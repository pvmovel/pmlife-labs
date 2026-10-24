// Coleções do Starlight: as páginas (src/content/docs, uma pasta por idioma; o português na raiz) e as traduções da
// interface do tema (vazia: o Starlight já traz pt-BR e en).
import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
