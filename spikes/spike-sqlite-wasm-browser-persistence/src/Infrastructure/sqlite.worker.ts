// Worker do SQLite: o banco roda fora da thread da interface (a cena 3D não trava em gravação).
//
// VFS opfs-sahpool: grava no OPFS (Origin Private File System) sem SharedArrayBuffer, ou seja,
// sem exigir os headers COOP/COEP, que bloqueariam recursos de outra origem na página.
import init, { type Database } from '@sqlite.org/sqlite-wasm';
import { migrate } from './localSchema';
import type { BenchResult, InitResult, Request, Response } from './protocol';
import { SqlProgressStore } from './SqlProgressStore';

let db: Database | null = null;
let store: SqlProgressStore | null = null;

const ms = (t0: number) => Math.round((performance.now() - t0) * 100) / 100;

async function open(): Promise<InitResult> {
  let t0 = performance.now();
  const sqlite3 = await init();
  const wasm = ms(t0);
  const sqliteVersion = sqlite3.version.libVersion;

  t0 = performance.now();
  let pool;
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'spike-sahpool' });
  } catch (e) {
    return { mode: 'unavailable', reason: String((e as Error).message ?? e), sqliteVersion, timings: { wasm, vfs: ms(t0), openAndMigrate: 0 } };
  }
  const vfs = ms(t0);

  t0 = performance.now();
  db = new pool.OpfsSAHPoolDb('/progress.sqlite3');
  const schema = migrate(db);
  store = new SqlProgressStore(db);
  return { mode: 'opfs', sqliteVersion, schema, timings: { wasm, vfs, openAndMigrate: ms(t0) } };
}

function bench(): BenchResult {
  if (!db) throw new Error('banco não aberto');
  const rows = 1000;
  const singleWrites = 50;
  db.exec('DROP TABLE IF EXISTS bench; CREATE TABLE bench (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');

  let t0 = performance.now();
  db.transaction((tx) => {
    const stmt = tx.prepare('INSERT INTO bench (payload) VALUES (?)');
    try {
      for (let i = 0; i < rows; i++) stmt.bind([`missao-${i}`]).stepReset();
    } finally {
      stmt.finalize();
    }
  });
  const insertBatchMs = ms(t0);

  t0 = performance.now();
  db.selectObjects('SELECT id, payload FROM bench');
  const readAllMs = ms(t0);

  // Cada gravação na sua própria transação: é o custo de um "concluir missão".
  t0 = performance.now();
  for (let i = 0; i < singleWrites; i++) db.exec({ sql: 'UPDATE bench SET payload = ? WHERE id = ?', bind: [`x${i}`, i + 1] });
  const singleWriteAvgMs = Math.round((ms(t0) / singleWrites) * 100) / 100;

  db.exec('DROP TABLE bench');
  return { rows, insertBatchMs, readAllMs, singleWrites, singleWriteAvgMs };
}

async function handle(req: Request): Promise<unknown> {
  if (req.op === 'init') return open();
  if (!store) throw new Error('banco não aberto');
  switch (req.op) {
    case 'load':
      return store.load(req.trackId);
    case 'save':
      return store.save(req.snapshot);
    case 'clear':
      return store.clear();
    case 'bench':
      return bench();
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  let res: Response;
  try {
    res = { id: req.id, ok: true, result: await handle(req) };
  } catch (e) {
    res = { id: req.id, ok: false, error: String((e as Error).message ?? e) };
  }
  self.postMessage(res);
};
