// ❌ Domain não pode depender da Infrastructure (import relativo também é pego).
import { InMemoryTaskRepository } from '../../src/Infrastructure/InMemoryTaskRepository';

export const leak = InMemoryTaskRepository;
