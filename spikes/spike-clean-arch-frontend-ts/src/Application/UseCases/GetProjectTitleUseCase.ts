// Caso de uso: devolve o título do projeto no idioma pedido. Depende só do Port.
import type { Language } from '@domain/ProjectTitles';
import type { ConfigGateway } from '../Ports/ConfigGateway';

export class GetProjectTitleUseCase {
  constructor(private readonly gateway: ConfigGateway) {}

  async execute(language: Language): Promise<string> {
    const titles = await this.gateway.getTitles();
    return titles.forLanguage(language);
  }
}
