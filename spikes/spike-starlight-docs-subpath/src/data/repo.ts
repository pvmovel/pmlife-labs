// Dados do repositório para o site, calculados no BUILD (nada disso roda no navegador): o mapa vira árvore, camadas e
// números, sempre sanitizado. No produto, a fonte é o docs/architecture/ESTRUTURA.md; aqui, o mapa fictício.
import raw from '../../fixtures/ESTRUTURA.md?raw';
import { assertNoLeaks, buildTree, mapStats, parseStructureMap, sanitizeEntry } from '../lib/structureMap';
import { FORBIDDEN, SANITIZE_RULES } from './sanitize';

export const entries = parseStructureMap(raw).map((e) => sanitizeEntry(e, SANITIZE_RULES));

assertNoLeaks(
  entries.flatMap((e) => [e.description, e.descriptionEn ?? '', e.origin ?? '']),
  FORBIDDEN,
);

export const tree = buildTree(entries.map((e) => e.path));
export const stats = mapStats(entries);
