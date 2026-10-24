// Documentação técnica com Astro Starlight num SUBCAMINHO de hospedagem compartilhada (no labs: /labs/spikes/<nome>/dist/;
// no produto: /architecture/). O build do labs passa o --base; localmente o site fica na raiz.
// Assets com hash em assets/ (a pasta que o .htaccess marca como immutable); HTML e JSON sem hash ficam no-cache.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  build: { assets: 'assets' },
  integrations: [
    starlight({
      title: { 'pt-BR': 'Horta Escolar · Arquitetura', en: 'School Garden · Architecture' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'Português', lang: 'pt-BR' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [
        { label: 'Visão do produto', translations: { en: 'Product vision' }, slug: 'index' },
        {
          label: 'Arquitetura',
          translations: { en: 'Architecture' },
          items: [
            { label: 'Camadas', translations: { en: 'Layers' }, slug: 'arquitetura/camadas' },
            { label: 'Explorador de arquivos', translations: { en: 'File explorer' }, slug: 'arquitetura/arquivos' },
            { label: 'Siga uma funcionalidade', translations: { en: 'Follow a feature' }, slug: 'arquitetura/funcionalidade' },
          ],
        },
        { label: 'Qualidade e segurança', translations: { en: 'Quality and security' }, slug: 'qualidade' },
      ],
    }),
    react(),
  ],
});
