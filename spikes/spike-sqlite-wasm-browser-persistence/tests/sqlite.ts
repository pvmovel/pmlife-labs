import init, { type Database } from '@sqlite.org/sqlite-wasm';

const sqlite3 = await init();

/** Banco novo em memória (no Node o pacote só suporta memória; a persistência OPFS é provada no e2e). */
export const memoryDb = (): Database => new sqlite3.oo1.DB(':memory:', 'c');
