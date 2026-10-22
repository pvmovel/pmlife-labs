// Domain: a fila local (outbox) das conclusões ainda não confirmadas pelo servidor. TypeScript puro.
//
// Concluir uma missão grava primeiro no aparelho (vale na hora, mesmo sem internet) e entra na fila. A fila só esvazia
// quando o servidor CONFIRMA a chave: se a resposta se perder no caminho, a conclusão é reenviada, e a chave de
// idempotência garante que o servidor conta uma vez só.
import { completionKey } from './ProgressMerge';

/** Uma conclusão esperando a confirmação do servidor. */
export interface PendingCompletion {
  readonly key: string;
  readonly questId: string;
  /** Quando o aluno concluiu (ISO 8601), para o servidor registrar a data real, não a do envio. */
  readonly completedAt: string;
}

export class Outbox {
  private readonly items: Map<string, PendingCompletion>;

  constructor(
    private readonly userId: string,
    private readonly trackId: string,
    pending: readonly PendingCompletion[] = [],
  ) {
    this.items = new Map(pending.map((p) => [p.key, p]));
  }

  /** Enfileira a conclusão (concluir de novo a mesma missão não duplica a fila). */
  add(questId: string, completedAt: string): PendingCompletion {
    const key = completionKey(this.userId, this.trackId, questId);
    const existing = this.items.get(key);
    if (existing) return existing;
    const item = { key, questId, completedAt };
    this.items.set(key, item);
    return item;
  }

  /** O que enviar agora (um lote com tudo o que está pendente). */
  pending(): readonly PendingCompletion[] {
    return [...this.items.values()];
  }

  /** O servidor confirmou estas chaves (aceitas, já existentes ou recusadas por não existirem no catálogo). */
  acknowledge(keys: readonly string[]): void {
    for (const k of keys) this.items.delete(k);
  }

  get size(): number {
    return this.items.size;
  }
}
