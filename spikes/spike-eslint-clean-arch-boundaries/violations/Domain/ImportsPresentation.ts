// ❌ Domain não pode depender de nenhuma camada (aqui: Presentation, via alias).
import { run } from '@presentation/cli';

export const leak = run;
