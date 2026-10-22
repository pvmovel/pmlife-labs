import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const alias = (dir: string) => path.resolve(import.meta.dirname, 'src', dir);

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: a demo funciona em qualquer subpasta (o labs publica em /labs/spikes/<nome>/dist/).
  base: './',
  resolve: {
    alias: {
      '@domain': alias('Domain'),
      '@application': alias('Application'),
      '@infrastructure': alias('Infrastructure'),
      '@presentation': alias('Presentation'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
