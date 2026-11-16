import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@domain': path.resolve(import.meta.dirname, 'src', 'Domain') } },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
