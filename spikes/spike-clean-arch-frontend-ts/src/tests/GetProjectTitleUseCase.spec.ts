import { describe, expect, it } from 'vitest';
import { GetProjectTitleUseCase } from '@application/UseCases/GetProjectTitleUseCase';
import { InMemoryConfigGateway } from '@infrastructure/InMemoryConfigGateway';

describe('GetProjectTitleUseCase (com gateway fake, sem rede)', () => {
  it('devolve o título no idioma pedido', async () => {
    const useCase = new GetProjectTitleUseCase(new InMemoryConfigGateway('Título', 'Title'));
    expect(await useCase.execute('pt-BR')).toBe('Título');
    expect(await useCase.execute('en-US')).toBe('Title');
  });

  it('usa o título padrão quando vem vazio e reaproveita o português no inglês', async () => {
    expect(await new GetProjectTitleUseCase(new InMemoryConfigGateway('  ', '')).execute('pt-BR')).toBe('Minha Plataforma');
    expect(await new GetProjectTitleUseCase(new InMemoryConfigGateway('Só PT', '')).execute('en-US')).toBe('Só PT');
  });
});
