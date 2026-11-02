// Busca, ordenação e paginação das tabelas do admin (US36), em TypeScript puro. No produto, a mesma consulta vai para o
// servidor (?q=&sort=&page=), que devolve a página e o total; aqui ela roda sobre os dados falsos da PoC.

/** O que a tabela pede. */
export interface ListQuery<Row> {
  /** Texto da busca; vazio mostra tudo. */
  readonly search: string;
  /** Campos em que a busca procura. */
  readonly fields: readonly (keyof Row)[];
  /** Campo e sentido da ordenação. */
  readonly sort?: { readonly field: keyof Row; readonly dir: 'asc' | 'desc' };
  /** Página pedida, a partir de 1. */
  readonly page: number;
  /** Linhas por página. */
  readonly pageSize: number;
}

/** Uma página da tabela. */
export interface ListPage<Row> {
  readonly items: Row[];
  /** Linhas que passaram na busca (todas as páginas). */
  readonly total: number;
  /** Total de páginas; pelo menos 1, mesmo sem linhas. */
  readonly pages: number;
  /** A página entregue: a pedida, trazida para dentro do intervalo. */
  readonly page: number;
}

/**
 * Texto para comparar: sem acentos, minúsculo e sem espaços nas pontas ("Ação" acha "acao").
 *
 * @param s - Texto.
 * @returns O texto normalizado.
 */
export const normalize = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * Filtra, ordena e corta uma página.
 *
 * @param rows - Todas as linhas.
 * @param q - A busca, a ordenação e a página.
 * @returns A página, com o total e o número de páginas.
 */
export function listRows<Row>(rows: readonly Row[], q: ListQuery<Row>): ListPage<Row> {
  const term = normalize(q.search);
  const found = term ? rows.filter((r) => q.fields.some((f) => normalize(String(r[f] ?? '')).includes(term))) : [...rows];
  if (q.sort) {
    const { field, dir } = q.sort;
    const sign = dir === 'asc' ? 1 : -1;
    found.sort((a, b) => sign * String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }
  const size = Math.max(1, Math.floor(q.pageSize));
  const pages = Math.max(1, Math.ceil(found.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(q.page)));
  return { items: found.slice((page - 1) * size, page * size), total: found.length, pages, page };
}
