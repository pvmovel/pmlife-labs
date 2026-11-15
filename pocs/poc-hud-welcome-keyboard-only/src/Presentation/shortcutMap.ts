// A lista de atalhos conferida uma vez, ao abrir a página: tecla repetida ou reservada falha aqui, não no meio da aula.
import data from '../Content/shortcuts.json';
import { toShortcuts } from '../Domain/Shortcuts';

export const SHORTCUTS = toShortcuts(data);
