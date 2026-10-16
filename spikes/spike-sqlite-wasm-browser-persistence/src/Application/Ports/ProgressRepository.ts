// Port: o que a aplicação precisa da persistência, sem saber se é SQLite no navegador, API ou memória.
import type { ProgressSnapshot } from '../../Domain/ProgressSnapshot';

export interface ProgressRepository {
  /** Progresso gravado da trilha, ou `null` se o aluno ainda não começou. */
  load(trackId: string): Promise<ProgressSnapshot | null>;
  /** Grava o progresso, substituindo o anterior da mesma trilha. */
  save(snapshot: ProgressSnapshot): Promise<void>;
}
