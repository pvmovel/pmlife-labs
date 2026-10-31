// A fila offline com versões (adaptação do spike-offline-first-progress-sync): o aparelho guarda só o id da missão;
// ao voltar a rede, o servidor tenta cada uma, em ordem, e decide a versão. O aparelho adota a lista do servidor.
import type { CourseProgress, RejectCode } from './CourseProgress';

export interface SyncResult {
  readonly progress: CourseProgress;
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly questId: string; readonly code: RejectCode }[];
}

/** Aplica a fila no progresso do servidor. Uma missão repetida (de outro aparelho) é recusada sem efeito. */
export function applyQueue(server: CourseProgress, queue: readonly string[]): SyncResult {
  let progress = server;
  const accepted: string[] = [];
  const rejected: { questId: string; code: RejectCode }[] = [];
  for (const questId of queue) {
    const a = progress.attempt(questId);
    if (a.ok) {
      progress = progress.with(a.completion);
      accepted.push(questId);
    } else rejected.push({ questId, code: a.code });
  }
  return { progress, accepted, rejected };
}
