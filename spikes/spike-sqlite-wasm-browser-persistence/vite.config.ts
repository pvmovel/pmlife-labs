import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // O pacote carrega o sqlite3.wasm por new URL(..., import.meta.url): o pré-bundle do Vite quebraria o caminho.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // O Worker importa módulos ES (o SQLite e o schema).
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'] },
});
