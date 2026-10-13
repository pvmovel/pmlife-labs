// ❌ Application conhece só o Port; o adaptador concreto entra pelo Composition Root.
import { InMemoryTaskRepository } from '@infrastructure/InMemoryTaskRepository';

export const leak = new InMemoryTaskRepository();
