import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // O benchmark carrega a cena junto com a página (é ela que se mede); a trava de tamanho (budget.json) é o limite que vale.
  build: { chunkSizeWarningLimit: 1400 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
