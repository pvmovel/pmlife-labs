// Caso de uso: o progresso de UM aparelho (navegador). Conclui na hora (vale offline), enfileira, sincroniza quando dá
// e incorpora o progresso de visitante ao entrar na conta. Depende só do Domain e do Port do servidor.
import { Outbox, type PendingCompletion } from '@domain/Outbox';
import { deriveXp, knownCompletions, mergeCompletions, type QuestCatalog } from '@domain/ProgressMerge';
import { NetworkError, type ProgressServer } from '../Ports/ProgressServer';

export type SyncResult = { readonly status: 'synced'; readonly rejected: readonly string[] } | { readonly status: 'offline' };

export class DeviceProgress {
  private completed: string[];
  private readonly outbox: Outbox;

  constructor(
    private readonly userId: string,
    private readonly catalog: QuestCatalog,
    private readonly server: ProgressServer,
    local: { completed?: readonly string[]; pending?: readonly PendingCompletion[] } = {},
  ) {
    this.completed = knownCompletions(local.completed ?? [], catalog);
    this.outbox = new Outbox(userId, catalog.trackId, local.pending ?? []);
  }

  /** Conclui a missão neste aparelho (vale na hora) e a põe na fila. Concluir de novo não muda nada. */
  complete(questId: string, now: Date): boolean {
    if (!this.catalog.has(questId) || this.completed.includes(questId)) return false;
    this.completed = mergeCompletions(this.completed, [questId]);
    this.outbox.add(questId, now.toISOString());
    return true;
  }

  /**
   * Ao entrar na conta: as missões feitas como visitante neste navegador entram na conta (decisão do produto) e vão
   * para a fila como qualquer conclusão.
   */
  adoptGuestProgress(guestCompleted: readonly string[], now: Date): number {
    let adopted = 0;
    for (const q of knownCompletions(guestCompleted, this.catalog)) {
      if (this.complete(q, now)) adopted++;
    }
    return adopted;
  }

  /** Envia a fila (ou só busca o estado) e une o que o servidor sabe. Sem rede, nada se perde. */
  async sync(): Promise<SyncResult> {
    let reply;
    try {
      reply = await this.server.sync(this.userId, this.catalog.trackId, this.outbox.pending());
    } catch (e) {
      if (e instanceof NetworkError) return { status: 'offline' };
      throw e;
    }
    this.outbox.acknowledge(reply.acknowledged);
    this.completed = knownCompletions(mergeCompletions(this.completed, reply.completed), this.catalog);
    return { status: 'synced', rejected: reply.rejected };
  }

  get state(): { readonly completed: readonly string[]; readonly xp: number; readonly pending: number } {
    return { completed: this.completed, xp: deriveXp(this.completed, this.catalog), pending: this.outbox.size };
  }

  /** O que persistir no navegador (no PMLife, no SQLite WASM): missões e fila. */
  snapshot(): { readonly completed: readonly string[]; readonly pending: readonly PendingCompletion[] } {
    return { completed: this.completed, pending: this.outbox.pending() };
  }
}
