// A "rede" entre um aparelho e o servidor, com as falhas que importam para a sincronização:
// - offline: o lote nem sai do aparelho;
// - lostReply: o lote CHEGA e é gravado, mas a resposta se perde (o aparelho acha que falhou e vai reenviar).
import type { PendingCompletion } from '@domain/Outbox';
import { NetworkError, type ProgressServer, type SyncReply } from '@application/Ports/ProgressServer';

export type LinkMode = 'online' | 'offline' | 'lostReply';

export class FlakyLink implements ProgressServer {
  mode: LinkMode = 'online';

  constructor(private readonly server: ProgressServer) {}

  async sync(userId: string, trackId: string, batch: readonly PendingCompletion[]): Promise<SyncReply> {
    if (this.mode === 'offline') throw new NetworkError();
    const reply = await this.server.sync(userId, trackId, batch);
    if (this.mode === 'lostReply') throw new NetworkError();
    return reply;
  }
}
