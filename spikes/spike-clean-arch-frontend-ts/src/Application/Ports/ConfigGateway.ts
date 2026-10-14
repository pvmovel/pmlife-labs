// Port: o que a aplicação precisa saber da configuração do projeto, sem saber de onde ela vem.
import type { ProjectTitles } from '@domain/ProjectTitles';

export interface ConfigGateway {
  /** @throws AppError */
  getTitles(): Promise<ProjectTitles>;
}
