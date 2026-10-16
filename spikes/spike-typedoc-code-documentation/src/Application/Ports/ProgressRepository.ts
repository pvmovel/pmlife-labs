import type { LearnerProgress, ProgressSnapshot } from '../../Domain/Entities/LearnerProgress';

/**
 * Porta de persistência do progresso do aluno.
 *
 * @remarks
 * A camada de aplicação depende só desta interface. As implementações concretas
 * (banco local no navegador, API HTTP, memória nos testes) ficam na infraestrutura
 * e são escolhidas no Composition Root.
 */
export interface ProgressRepository {
  /**
   * Lê o progresso gravado de uma trilha.
   *
   * @param trackId - Id da trilha.
   * @returns O snapshot, ou `null` se o aluno ainda não começou a trilha.
   */
  load(trackId: string): Promise<ProgressSnapshot | null>;

  /**
   * Grava o progresso, substituindo o anterior da mesma trilha.
   *
   * @param snapshot - Estado a gravar (veja {@link LearnerProgress.toSnapshot}).
   */
  save(snapshot: ProgressSnapshot): Promise<void>;
}
