// ❌ Fora de Presentation/di, a Presentation não pode importar a Infrastructure.
import { InMemoryTaskRepository } from '@infrastructure/InMemoryTaskRepository';

export const leak = new InMemoryTaskRepository();
