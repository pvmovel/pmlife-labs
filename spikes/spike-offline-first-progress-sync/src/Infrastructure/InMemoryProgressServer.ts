// Servidor em memória com a MESMA regra do endpoint PHP do produto (tabela quest_completions):
// - a chave (aluno, trilha, missão) é única: gravar de novo não faz nada (INSERT IGNORE / ON CONFLICT DO NOTHING);
// - só aceita missões do catálogo da trilha; as outras são recusadas e confirmadas (saem da fila, sem XP);
// - responde o estado inteiro do aluno, para o aparelho unir com o dele.
import type { PendingCompletion } from '@domain/Outbox';
import { completionKey, type QuestCatalog } from '@domain/ProgressMerge';
import type { ProgressServer, SyncReply } from '@application/Ports/ProgressServer';

export class InMemoryProgressServer implements ProgressServer {
  /** Linhas gravadas: chave ➔ data da conclusão. Simula a tabela quest_completions. */
  readonly rows = new Map<string, { userId: string; trackId: string; questId: string; completedAt: string }>();
  /** Quantos lotes chegaram (inclusive os repetidos), para os testes e a demo. */
  received = 0;

  constructor(private readonly catalogs: ReadonlyMap<string, QuestCatalog>) {}

  async sync(userId: string, trackId: string, batch: readonly PendingCompletion[]): Promise<SyncReply> {
    this.received++;
    const catalog = this.catalogs.get(trackId);
    if (!catalog) throw new Error('UNKNOWN_TRACK');
    const acknowledged: string[] = [];
    const rejected: string[] = [];
    for (const item of batch) {
      // A chave é recalculada no servidor: o cliente não escolhe de quem é a linha.
      const key = completionKey(userId, trackId, item.questId);
      acknowledged.push(item.key);
      if (!catalog.has(item.questId)) {
        rejected.push(item.questId);
        continue;
      }
      if (!this.rows.has(key)) this.rows.set(key, { userId, trackId, questId: item.questId, completedAt: item.completedAt });
    }
    const completed = [...this.rows.values()].filter((r) => r.userId === userId && r.trackId === trackId).map((r) => r.questId);
    return { completed, acknowledged, rejected };
  }
}
