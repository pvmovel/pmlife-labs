// O mapa do repositório (ESTRUTURA.md) vira dado para o site: cada arquivo num bloco
//   #### `caminho`
//   <parágrafo com a função>
//   - **EN:** <a função em inglês> (opcional)
//   - **Expõe:** `A`, `B`
//   - **Usado por:** `x`, `y`
//   - **Criado em:** `hash` (data) mensagem
//   - **Conformidade:** ✅ sem achados | ⚠️ ...
// TypeScript puro, sem Astro nem React: roda no build e nos testes.

/** Um arquivo descrito no mapa. */
export interface MapEntry {
  readonly path: string;
  readonly description: string;
  /** Descrição em inglês; sem ela, o site mostra a de português. */
  readonly descriptionEn?: string;
  readonly exports: readonly string[];
  readonly usedBy: readonly string[];
  readonly origin?: string;
  /** `ok`, `finding` (há achado da auditoria) ou ausente (testes, conteúdo, docs). */
  readonly conformity?: 'ok' | 'finding';
  readonly layer: LayerId;
}

/** As camadas, mais o que não é camada (backend, testes, docs, infraestrutura de entrega). */
export type LayerId = 'domain' | 'application' | 'infrastructure' | 'presentation' | 'composition-root' | 'content' | 'tests' | 'backend' | 'delivery' | 'docs';

const LAYERS: readonly [RegExp, LayerId][] = [
  [/^src\/tests\//, 'tests'],
  [/^src\/Domain\//, 'domain'],
  [/^src\/Application\//, 'application'],
  [/^src\/Infrastructure\//, 'infrastructure'],
  [/^src\/Presentation\/di\//, 'composition-root'],
  [/^src\/Presentation\//, 'presentation'],
  [/^src\/Content\//, 'content'],
  [/^(php_backend|public\/api|backend)\//, 'backend'],
  [/^(docs\/|README\.md$|CLAUDE\.md$)/, 'docs'],
];

/** A camada (ou a área) de um caminho. */
export function layerOf(path: string): LayerId {
  return LAYERS.find(([rx]) => rx.test(path))?.[1] ?? 'delivery';
}

const codes = (line: string) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** Lê os blocos `#### \`caminho\`` do mapa. Títulos de seção (##, ###) e tabelas de pastas são ignorados. */
export function parseStructureMap(markdown: string): MapEntry[] {
  const entries: MapEntry[] = [];
  const blocks = markdown.split(/^#### /m).slice(1);
  for (const block of blocks) {
    const [head, ...lines] = block.split('\n');
    const path = /^`([^`]+)`\s*$/.exec(head.trim())?.[1];
    if (!path) continue;
    const body = lines.join('\n').split(/\n(?=#{1,3} )/)[0];
    const paragraph = body
      .split('\n')
      .filter((l) => l.trim() !== '' && !l.startsWith('- **'))
      .join(' ')
      .trim();
    const field = (name: string) => body.split('\n').find((l) => l.startsWith(`- **${name}:**`))?.replace(`- **${name}:**`, '').trim();
    const conformity = field('Conformidade');
    entries.push({
      path,
      description: paragraph,
      ...(field('EN') ? { descriptionEn: field('EN') } : {}),
      exports: codes(field('Expõe') ?? ''),
      usedBy: codes(field('Usado por') ?? ''),
      ...(field('Criado em') ? { origin: field('Criado em')!.replace(/`/g, '') } : {}),
      ...(conformity ? { conformity: conformity.startsWith('✅') ? ('ok' as const) : ('finding' as const) } : {}),
      layer: layerOf(path),
    });
  }
  return entries;
}

/** Uma pasta ou um arquivo da árvore do explorador. */
export interface TreeNode {
  readonly name: string;
  readonly path: string;
  readonly children?: TreeNode[];
}

/** Monta a árvore de pastas: pastas primeiro, depois arquivos, em ordem alfabética. */
export function buildTree(paths: readonly string[]): TreeNode {
  const root: TreeNode = { name: '/', path: '', children: [] };
  for (const p of paths) {
    let node = root;
    const parts = p.split('/');
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/') + (isFile ? '' : '/');
      let child = node.children!.find((c) => c.name === part && !!c.children === !isFile);
      if (!child) {
        child = isFile ? { name: part, path } : { name: part, path, children: [] };
        node.children!.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children?.sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name));
    n.children?.forEach(sort);
  };
  sort(root);
  return root;
}

/** Uma regra de sanitização: o que casar com `pattern` vira o texto genérico do idioma. */
export interface SanitizeRule {
  readonly pattern: RegExp;
  readonly replacement: { readonly pt: string; readonly en: string };
}

/** Aplica as regras a um texto, no idioma dele. */
export function sanitize(text: string, rules: readonly SanitizeRule[], lang: 'pt' | 'en' = 'pt'): string {
  return rules.reduce((t, r) => t.replace(r.pattern, r.replacement[lang]), text);
}

/** Aplica as regras a todos os textos de uma entrada (o caminho e os nomes exportados não mudam). */
export function sanitizeEntry(entry: MapEntry, rules: readonly SanitizeRule[]): MapEntry {
  return {
    ...entry,
    description: sanitize(entry.description, rules, 'pt'),
    ...(entry.descriptionEn ? { descriptionEn: sanitize(entry.descriptionEn, rules, 'en') } : {}),
    ...(entry.origin ? { origin: sanitize(entry.origin, rules, 'pt') } : {}),
  };
}

/** Termos que nunca podem ser publicados, depois da sanitização. */
export class LeakError extends Error {
  constructor(readonly leaks: readonly string[]) {
    super(`Conteúdo sensível no site: ${leaks.join('; ')}`);
    this.name = 'LeakError';
  }
}

/** Falha fechada: se sobrar algum termo proibido em algum texto, o build para. */
export function assertNoLeaks(texts: readonly string[], forbidden: readonly RegExp[]): void {
  const leaks = texts.flatMap((t) => forbidden.filter((rx) => rx.test(t)).map((rx) => `${rx} em "${t.slice(0, 80)}"`));
  if (leaks.length) throw new LeakError(leaks);
}

/** Números do projeto calculados do mapa. */
export interface MapStats {
  readonly files: number;
  readonly byLayer: Readonly<Record<LayerId, number>>;
  readonly exports: number;
  readonly conformant: number;
  readonly withFindings: number;
}

/** Conta arquivos, arquivos por camada, exports e a conformidade. */
export function mapStats(entries: readonly MapEntry[]): MapStats {
  const byLayer = Object.fromEntries(LAYERS.map(([, id]) => [id, 0]).concat([['delivery', 0]])) as Record<LayerId, number>;
  for (const e of entries) byLayer[e.layer]++;
  return {
    files: entries.length,
    byLayer,
    exports: entries.reduce((n, e) => n + e.exports.length, 0),
    conformant: entries.filter((e) => e.conformity === 'ok').length,
    withFindings: entries.filter((e) => e.conformity === 'finding').length,
  };
}
