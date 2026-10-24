// Explorador de arquivos: a árvore do repositório (gerada no build a partir do mapa) e, ao lado, o que cada arquivo faz,
// o que expõe, quem o usa, de onde veio e a conformidade. Sem código-fonte: só o que o mapa público descreve.
import { useMemo, useState } from 'react';
import type { MapEntry, TreeNode } from '../lib/structureMap';

export interface ExplorerLabels {
  filter: string;
  empty: string;
  pick: string;
  layer: string;
  exports: string;
  usedBy: string;
  origin: string;
  conformity: string;
  ok: string;
  finding: string;
  ptOnly: string;
  layers: Record<string, string>;
}

const LAYER_COLORS: Record<string, string> = {
  domain: '#16a34a',
  application: '#2563eb',
  infrastructure: '#9333ea',
  presentation: '#ea580c',
  'composition-root': '#db2777',
  content: '#0d9488',
  tests: '#64748b',
  backend: '#b45309',
  delivery: '#475569',
  docs: '#0891b2',
};

function Badge({ layer, labels }: { layer: string; labels: ExplorerLabels }) {
  return (
    <span data-layer={layer} style={{ display: 'inline-block', padding: '0.05rem 0.45rem', borderRadius: '999px', fontSize: '0.75rem', color: '#fff', backgroundColor: LAYER_COLORS[layer] ?? '#475569' }}>
      {labels.layers[layer] ?? layer}
    </span>
  );
}

function Node({ node, depth, open, toggle, selected, select, visible }: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (p: string) => void;
  selected: string | null;
  select: (p: string) => void;
  visible: (n: TreeNode) => boolean;
}) {
  if (!visible(node)) return null;
  const pad = { paddingLeft: `${depth * 0.9}rem` };
  if (node.children) {
    const isOpen = open.has(node.path);
    return (
      <li>
        <button type="button" aria-expanded={isOpen} onClick={() => toggle(node.path)} style={{ ...pad, ...rowStyle }}>
          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {node.name}/
        </button>
        {isOpen && (
          <ul style={listStyle}>
            {node.children.map((c) => (
              <Node key={c.path} node={c} depth={depth + 1} open={open} toggle={toggle} selected={selected} select={select} visible={visible} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        data-file={node.path}
        aria-current={selected === node.path ? 'true' : undefined}
        onClick={() => select(node.path)}
        style={{ ...pad, ...rowStyle, fontWeight: selected === node.path ? 700 : 400, backgroundColor: selected === node.path ? 'var(--sl-color-gray-6)' : 'transparent' }}
      >
        {node.name}
      </button>
    </li>
  );
}

const rowStyle = { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--sl-color-text)', cursor: 'pointer', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', fontFamily: 'var(--sl-font-mono)', fontSize: '0.85rem' } as const;
const listStyle = { listStyle: 'none', margin: 0, padding: 0 } as const;

const folderPaths = (n: TreeNode): string[] => (n.children ? [n.path, ...n.children.flatMap(folderPaths)] : []);

export default function FileExplorer({ tree, entries, labels, lang }: { tree: TreeNode; entries: readonly MapEntry[]; labels: ExplorerLabels; lang: 'pt' | 'en' }) {
  const byPath = useMemo(() => new Map(entries.map((e) => [e.path, e])), [entries]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.children?.filter((c) => c.children).map((c) => c.path)));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const matches = (n: TreeNode): boolean => (n.children ? n.children.some(matches) : n.path.toLowerCase().includes(q) || (byPath.get(n.path)?.description.toLowerCase().includes(q) ?? false));
  const visible = (n: TreeNode) => q === '' || matches(n);
  const shownOpen = q === '' ? open : new Set(folderPaths(tree));
  const toggle = (p: string) => setOpen((s) => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set([...s, p])));
  const select = (p: string) => {
    setSelected(p);
    setOpen((s) => new Set([...s, ...p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/') + '/')]));
  };
  const entry = selected ? byPath.get(selected) : undefined;

  return (
    <div data-testid="file-explorer" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: '1rem', alignItems: 'start' }} className="not-content">
      <div style={{ border: '1px solid var(--sl-color-gray-5)', borderRadius: '0.5rem', padding: '0.5rem', maxHeight: '32rem', overflow: 'auto' }}>
        <input
          type="search"
          aria-label={labels.filter}
          placeholder={labels.filter}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: '1px solid var(--sl-color-gray-5)', background: 'var(--sl-color-bg)', color: 'var(--sl-color-text)' }}
        />
        <ul aria-label={labels.pick} style={listStyle}>
          {tree.children?.map((c) => <Node key={c.path} node={c} depth={0} open={shownOpen} toggle={toggle} selected={selected} select={select} visible={visible} />)}
        </ul>
        {q !== '' && !tree.children?.some(matches) && <p>{labels.empty}</p>}
      </div>
      <div data-testid="file-details" aria-live="polite" style={{ border: '1px solid var(--sl-color-gray-5)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
        {!entry ? (
          <p style={{ margin: 0, color: 'var(--sl-color-gray-3)' }}>{labels.pick}</p>
        ) : (
          <>
            <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--sl-font-mono)', fontSize: '0.85rem', wordBreak: 'break-all' }}>{entry.path}</p>
            <p style={{ margin: '0 0 0.6rem' }}>
              {labels.layer}: <Badge layer={entry.layer} labels={labels} />
            </p>
            <p data-testid="file-description" style={{ margin: '0 0 0.6rem' }}>
              {lang === 'en' && entry.descriptionEn ? entry.descriptionEn : entry.description}
              {lang === 'en' && !entry.descriptionEn && <em> ({labels.ptOnly})</em>}
            </p>
            {entry.exports.length > 0 && (
              <p style={{ margin: '0 0 0.4rem' }}>
                <strong>{labels.exports}:</strong> {entry.exports.map((x) => <code key={x} style={{ marginRight: '0.3rem' }}>{x}</code>)}
              </p>
            )}
            {entry.usedBy.length > 0 && (
              <div style={{ margin: '0 0 0.4rem' }}>
                <strong>{labels.usedBy}:</strong>
                <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem' }}>
                  {entry.usedBy.map((u) => (
                    <li key={u}>
                      {byPath.has(u) ? (
                        <button type="button" onClick={() => select(u)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--sl-color-text-accent)', cursor: 'pointer', fontFamily: 'var(--sl-font-mono)', fontSize: '0.8rem', textDecoration: 'underline' }}>
                          {u}
                        </button>
                      ) : (
                        <code>{u}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {entry.origin && (
              <p style={{ margin: '0 0 0.4rem' }}>
                <strong>{labels.origin}:</strong> {entry.origin}
              </p>
            )}
            {entry.conformity && (
              <p style={{ margin: 0 }}>
                <strong>{labels.conformity}:</strong> {entry.conformity === 'ok' ? `✅ ${labels.ok}` : `⚠️ ${labels.finding}`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
