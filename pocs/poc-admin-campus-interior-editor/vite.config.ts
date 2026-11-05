import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // O pedaço grande é o 3D da pré-visualização (Three.js), que só é baixado quando alguém abre: o aviso não se aplica.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
