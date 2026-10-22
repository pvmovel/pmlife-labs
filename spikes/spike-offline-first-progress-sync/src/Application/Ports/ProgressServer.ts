// Port: o servidor do progresso (no PMLife, POST /api/progress.php). A Application não sabe se é HTTP ou memória.
import type { PendingCompletion } from '@domain/Outbox';

/** Resposta do servidor a um lote: o estado dele já unido e o que ele confirmou. */
export interface SyncReply {
  /** Todas as missões concluídas que o servidor conhece para o aluno (já com o lote). */
  readonly completed: readonly string[];
  /** Chaves do lote que podem sair da fila: gravadas agora, já existentes ou recusadas. */
  readonly acknowledged: readonly string[];
  /** Missões recusadas por não existirem no catálogo (nunca valem XP). */
  readonly rejected: readonly string[];
}

/** Falha de rede: o lote pode ou não ter chegado; a fila continua e o próximo envio repete. */
export class NetworkError extends Error {
  constructor() {
    super('NETWORK_ERROR');
  }
}

export interface ProgressServer {
  /**
   * Envia um lote (pode ser vazio, só para buscar o estado) e devolve o estado do servidor.
   *
   * @throws NetworkError quando a resposta não chega.
   */
  sync(userId: string, trackId: string, batch: readonly PendingCompletion[]): Promise<SyncReply>;
}
