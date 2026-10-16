// Escolhe a implementação do Port (no produto, isto fica no Composition Root):
// SQLite WASM + OPFS quando possível; senão, memória com aviso de que o progresso não será salvo.
import type { ProgressRepository } from '../Application/Ports/ProgressRepository';
import { InMemoryProgressRepository } from './InMemoryProgressRepository';
import type { InitResult } from './protocol';
import { WorkerProgressRepository } from './WorkerProgressRepository';

export type Storage =
  | { kind: 'opfs'; repository: ProgressRepository; sqlite: WorkerProgressRepository; info: InitResult }
  | { kind: 'memory'; repository: ProgressRepository; reason: string };

export async function createProgressRepository(options: { simulateNoOpfs?: boolean } = {}): Promise<Storage> {
  const noOpfs = options.simulateNoOpfs || typeof navigator === 'undefined' || !('storage' in navigator) || !navigator.storage.getDirectory;
  if (noOpfs) {
    return { kind: 'memory', repository: new InMemoryProgressRepository(), reason: options.simulateNoOpfs ? 'simulado' : 'navegador sem OPFS' };
  }

  const sqlite = new WorkerProgressRepository(
    new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' }),
  );
  try {
    const info = await sqlite.init();
    if (info.mode === 'opfs') return { kind: 'opfs', repository: sqlite, sqlite, info };
    sqlite.terminate();
    return { kind: 'memory', repository: new InMemoryProgressRepository(), reason: info.reason ?? 'OPFS indisponível' };
  } catch (e) {
    sqlite.terminate();
    return { kind: 'memory', repository: new InMemoryProgressRepository(), reason: String((e as Error).message ?? e) };
  }
}
