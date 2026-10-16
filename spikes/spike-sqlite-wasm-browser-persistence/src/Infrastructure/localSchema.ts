// Schema local versionado: a mesma ideia das migrations do servidor (tabela schema_migrations),
// aplicada no SQLite do navegador a cada abertura do banco. Só migrations novas rodam.
import type { Database } from '@sqlite.org/sqlite-wasm';

export interface Migration {
  readonly version: number;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `CREATE TABLE progress (
            track_id   TEXT PRIMARY KEY,
            xp         INTEGER NOT NULL CHECK (xp >= 0),
            updated_at TEXT NOT NULL
          )`,
  },
  {
    version: 2,
    sql: `CREATE TABLE completed_missions (
            track_id     TEXT NOT NULL REFERENCES progress (track_id) ON DELETE CASCADE,
            mission_id   TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            PRIMARY KEY (track_id, mission_id)
          )`,
  },
];

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
}

/** Aplica, em ordem e cada uma na sua transação, as migrations ainda não registradas. */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
             version    INTEGER PRIMARY KEY,
             applied_at TEXT NOT NULL
           )`);
  const from = Number(db.selectValue('SELECT COALESCE(MAX(version), 0) FROM schema_migrations'));
  const applied: number[] = [];

  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= from) continue;
    db.transaction((tx) => {
      tx.exec(m.sql);
      tx.exec({
        sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
        bind: [m.version],
      });
    });
    applied.push(m.version);
  }

  return { from, to: applied.at(-1) ?? from, applied };
}
