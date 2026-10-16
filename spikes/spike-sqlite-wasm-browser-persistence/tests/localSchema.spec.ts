import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../src/Infrastructure/localSchema';
import { memoryDb } from './sqlite';

const tables = (db: ReturnType<typeof memoryDb>) =>
  db.selectValues("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");

describe('schema local versionado', () => {
  it('banco vazio: aplica todas as migrations, em ordem, e registra cada versão', () => {
    const db = memoryDb();
    expect(migrate(db)).toEqual({ from: 0, to: 2, applied: [1, 2] });
    expect(tables(db)).toEqual(['completed_missions', 'progress', 'schema_migrations']);
    expect(db.selectValues('SELECT version FROM schema_migrations ORDER BY version')).toEqual([1, 2]);
  });

  it('reabrir o banco não reaplica nada (idempotente)', () => {
    const db = memoryDb();
    migrate(db);
    expect(migrate(db)).toEqual({ from: 2, to: 2, applied: [] });
  });

  it('banco de uma versão anterior com dados: aplica só o que falta e preserva os dados', () => {
    const db = memoryDb();
    migrate(db, MIGRATIONS.slice(0, 1)); // usuário que abriu a versão 1 do app
    db.exec("INSERT INTO progress (track_id, xp, updated_at) VALUES ('t', 700, datetime('now'))");

    expect(migrate(db)).toEqual({ from: 1, to: 2, applied: [2] });
    expect(db.selectValue("SELECT xp FROM progress WHERE track_id = 't'")).toBe(700);
  });

  it('migration com erro: desfaz a transação e não registra a versão', () => {
    const db = memoryDb();
    migrate(db);
    const broken = [...MIGRATIONS, { version: 3, sql: 'ALTER TABLE tabela_que_nao_existe ADD COLUMN x' }];

    expect(() => migrate(db, broken)).toThrow();
    expect(db.selectValue('SELECT MAX(version) FROM schema_migrations')).toBe(2);
  });
});
