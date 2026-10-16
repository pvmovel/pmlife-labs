// Mensagens entre a página e o Worker do SQLite.
import type { ProgressSnapshot } from '../Domain/ProgressSnapshot';
import type { MigrationResult } from './localSchema';

export interface InitResult {
  /** `opfs`: banco persistente; `unavailable`: sem OPFS (ou outra aba segura o pool) e a página cai para memória. */
  readonly mode: 'opfs' | 'unavailable';
  readonly reason?: string;
  readonly sqliteVersion: string;
  readonly schema?: MigrationResult;
  /** Tempos da abertura, em ms. */
  readonly timings: { readonly wasm: number; readonly vfs: number; readonly openAndMigrate: number };
}

export interface BenchResult {
  readonly rows: number;
  readonly insertBatchMs: number;
  readonly readAllMs: number;
  readonly singleWrites: number;
  readonly singleWriteAvgMs: number;
}

export type Request =
  | { id: number; op: 'init' }
  | { id: number; op: 'load'; trackId: string }
  | { id: number; op: 'save'; snapshot: ProgressSnapshot }
  | { id: number; op: 'clear' }
  | { id: number; op: 'bench' };

export type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
