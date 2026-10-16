// SQL do progresso, separado do Worker para ser testado no Node (SQLite em memória).
import type { Database } from '@sqlite.org/sqlite-wasm';
import type { ProgressSnapshot } from '../Domain/ProgressSnapshot';

export class SqlProgressStore {
  constructor(private readonly db: Database) {
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  load(trackId: string): ProgressSnapshot | null {
    const xp = this.db.selectValue('SELECT xp FROM progress WHERE track_id = ?', [trackId]);
    if (xp === undefined) return null;
    const missions = this.db.selectValues(
      'SELECT mission_id FROM completed_missions WHERE track_id = ? ORDER BY completed_at, mission_id',
      [trackId],
    );
    return { trackId, xp: Number(xp), completedMissions: missions.map(String) };
  }

  /** Upsert do progresso e das missões numa única transação: ou grava tudo, ou nada. */
  save(snapshot: ProgressSnapshot): void {
    this.db.transaction((tx) => {
      tx.exec({
        sql: `INSERT INTO progress (track_id, xp, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT (track_id) DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at`,
        bind: [snapshot.trackId, snapshot.xp],
      });
      tx.exec({ sql: 'DELETE FROM completed_missions WHERE track_id = ?', bind: [snapshot.trackId] });
      snapshot.completedMissions.forEach((missionId, i) => {
        tx.exec({
          // completed_at preserva a ordem de conclusão dentro do mesmo segundo
          sql: "INSERT INTO completed_missions (track_id, mission_id, completed_at) VALUES (?, ?, datetime('now', ? || ' seconds'))",
          bind: [snapshot.trackId, missionId, String(i)],
        });
      });
    });
  }

  clear(): void {
    this.db.exec('DELETE FROM completed_missions; DELETE FROM progress;');
  }
}
