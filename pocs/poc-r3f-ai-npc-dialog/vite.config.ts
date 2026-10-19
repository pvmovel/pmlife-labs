import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // O chunk da cena (three.js, ~1 MB; ~290 KB com gzip) é carregado sob demanda pelo React.lazy: o aviso de 500 KB não se aplica.
  build: { chunkSizeWarningLimit: 1200 },
  // public/ é o webroot PHP da demo no servidor, não arquivos estáticos do Vite: não vai para dentro do dist/.
  publicDir: false,
  // `yarn dev` + `yarn api:dev`: o mock PHP roda no php -S da porta 8000.
  server: { proxy: { '/public': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
