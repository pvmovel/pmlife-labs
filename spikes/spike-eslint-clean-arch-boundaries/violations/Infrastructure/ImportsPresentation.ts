// ❌ Infrastructure não pode depender da Presentation.
import { run } from '@presentation/cli';

export const leak = run;
