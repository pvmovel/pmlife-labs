import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // `yarn dev` + `yarn api:dev`: o endpoint PHP roda no php -S da porta 8000 (precisa de PHP 8.2).
  server: { proxy: { '/public': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./web/tests/setup.ts'],
    include: ['web/**/*.spec.{ts,tsx}'],
  },
});
