// Adapter em memória: mesma interface, sem rede. Usado em testes e na demo.
import type { ConfigGateway } from '@application/Ports/ConfigGateway';
import { ProjectTitles } from '@domain/ProjectTitles';

export class InMemoryConfigGateway implements ConfigGateway {
  constructor(
    private readonly pt: string,
    private readonly en: string,
    private readonly delayMs = 0,
  ) {}

  async getTitles(): Promise<ProjectTitles> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return ProjectTitles.create(this.pt, this.en);
  }
}
