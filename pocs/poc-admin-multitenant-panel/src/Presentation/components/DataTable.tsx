// Tabela do admin: busca (sem acento), ordenação pelo cabeçalho (aria-sort) e paginação, com a conta no Domain
// (listRows). Num celular, cada linha vira um cartão (o CSS usa o data-label de cada célula).
import { useId, useMemo, useState, type ReactNode } from 'react';
import { listRows } from '../../Domain/Listing';
import { useI18n } from '../i18n';

export interface Column<Row> {
  /** Campo usado na ordenação e na busca. */
  readonly field: keyof Row & string;
  readonly label: string;
  /** Como mostrar (padrão: o valor do campo). */
  readonly render?: (row: Row) => ReactNode;
  readonly sortable?: boolean;
}

export function DataTable<Row>({
  caption,
  rows,
  columns,
  searchFields,
  actions,
  pageSize = 8,
  rowKey,
  empty,
}: {
  caption: string;
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  searchFields: readonly (keyof Row & string)[];
  actions?: (row: Row) => ReactNode;
  pageSize?: number;
  rowKey: (row: Row) => string;
  empty?: string;
}) {
  const { t } = useI18n();
  const searchId = useId();
  const hintId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: keyof Row & string; dir: 'asc' | 'desc' } | undefined>(undefined);
  const result = useMemo(() => listRows(rows, { search, fields: searchFields, sort, page, pageSize }), [rows, search, searchFields, sort, page, pageSize]);

  const toggleSort = (field: keyof Row & string) => setSort((s) => (s?.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));

  return (
    <section className="table-card">
      <div className="table-tools">
        <label htmlFor={searchId}>{t('table.search')}</label>
        <input
          id={searchId}
          type="search"
          value={search}
          aria-describedby={hintId}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <span id={hintId} className="hint">
          {t('table.searchHint')}
        </span>
        <span className="count" role="status">
          {t('table.results', { total: result.total })}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.field} scope="col" aria-sort={sort?.field === c.field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}>
                  {c.sortable ? (
                    <button type="button" className="sort" onClick={() => toggleSort(c.field)} aria-label={t('table.sortBy', { column: c.label })}>
                      {c.label}
                      <span aria-hidden="true">{sort?.field === c.field ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {actions && <th scope="col">{t('table.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="empty">
                  {empty ?? t('table.empty')}
                </td>
              </tr>
            ) : (
              result.items.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td key={c.field} data-label={c.label}>
                      {c.render ? c.render(row) : String(row[c.field] ?? '')}
                    </td>
                  ))}
                  {actions && (
                    <td data-label={t('table.actions')}>
                      <div className="row-actions">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {result.pages > 1 && (
        <nav className="pagination" aria-label={t('table.pagination')}>
          <button type="button" className="button" disabled={result.page === 1} onClick={() => setPage(result.page - 1)}>
            {t('table.prev')}
          </button>
          <span aria-live="polite">{t('table.page', { page: result.page, pages: result.pages })}</span>
          <button type="button" className="button" disabled={result.page === result.pages} onClick={() => setPage(result.page + 1)}>
            {t('table.next')}
          </button>
        </nav>
      )}
    </section>
  );
}
