import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // O chunk da cena (three.js, ~1 MB; ~290 KB com gzip) é carregado sob demanda pelo React.lazy: o aviso de 500 KB não se aplica.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
