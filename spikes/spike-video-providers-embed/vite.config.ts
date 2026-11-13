import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
