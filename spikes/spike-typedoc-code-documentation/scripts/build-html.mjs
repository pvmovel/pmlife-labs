// Gera a demo: a mesma documentação em HTML (dist/), com hash no nome de cada asset.
//
// Por que o hash: o /labs passa pelo Cloudflare, que força no mínimo 4h de cache em CSS/JS/SVG,
// e o .htaccess marca /dist/assets/ como immutable. O TypeDoc gera nomes fixos (assets/main.js),
// então sem o hash um visitante veria o asset antigo depois de um deploy.
//
// O build-site.sh chama "yarn build --base=..."; os argumentos são ignorados, porque o TypeDoc
// gera links relativos.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// readdirSync({ recursive }) exige Node 20+; num Node antigo o build sairia pela metade, sem erro.
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error(`ERRO: Node ${process.versions.node}; o build exige Node 20+ (use: nvm use 24).`);
  process.exit(1);
}

const DIST = 'dist';
const ASSETS = path.join(DIST, 'assets');

rmSync(DIST, { recursive: true, force: true });
const run = spawnSync('node_modules/.bin/typedoc', ['--options', 'typedoc.html.json'], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);

// 1. Renomeia assets/<nome>.<ext> para assets/<nome>.<hash8>.<ext>.
const renamed = new Map();
for (const file of readdirSync(ASSETS)) {
  const hash = createHash('sha256').update(readFileSync(path.join(ASSETS, file))).digest('hex').slice(0, 8);
  const ext = path.extname(file);
  const hashed = `${path.basename(file, ext)}.${hash}${ext}`;
  renameSync(path.join(ASSETS, file), path.join(ASSETS, hashed));
  renamed.set(file, hashed);
}

// Botões obrigatórios no topo de toda demo do labs (README do labs): voltar ao portfólio e documentação do item.
// Links relativos, ajustados à profundidade de cada página (dist/index.html, dist/classes/x.html...).
const ITEM = path.basename(process.cwd());
const NAV_STYLE =
  '<style>.labs-nav{display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;border-bottom:1px solid var(--color-accent)}' +
  '.labs-nav a{padding:6px 12px;border:1px solid var(--color-accent);border-radius:8px;color:var(--color-text);' +
  'text-decoration:none;font-weight:600;font-size:.9rem}.labs-nav a:hover{border-color:var(--color-link)}</style>';
const labsNav = (depth) => {
  const up = '../'.repeat(depth) + '../../../';
  return (
    `<nav class="labs-nav" aria-label="PMLife Labs"><a href="${up}">← PMLife Labs</a>` +
    `<a href="${up}catalogo/${ITEM}/">Documentação</a></nav>`
  );
};

// 2. Reescreve as referências (assets/x, ../assets/x) em todos os HTML e injeta a navegação do labs.
const htmlFiles = readdirSync(DIST, { recursive: true }).filter((f) => f.endsWith('.html'));
const stale = [];
for (const rel of htmlFiles) {
  const file = path.join(DIST, rel);
  let html = readFileSync(file, 'utf8');
  for (const [from, to] of renamed) html = html.replaceAll(`assets/${from}`, `assets/${to}`);
  const depth = rel.split(path.sep).length - 1;
  html = html.replace('</head>', `${NAV_STYLE}</head>`).replace(/<body([^>]*)>/, `<body$1>${labsNav(depth)}`);
  if (!html.includes('class="labs-nav"')) stale.push(`${rel} -> sem navegação do labs`);
  writeFileSync(file, html);
  for (const from of renamed.keys()) if (html.includes(`assets/${from}`)) stale.push(`${rel} -> ${from}`);
}

// 3. Nenhum asset sem hash e nenhuma referência ao nome antigo.
const unhashed = readdirSync(ASSETS).filter((f) => !/\.[0-9a-f]{8}\.[a-z0-9]+$/.test(f));
if (unhashed.length || stale.length) {
  console.error('ERRO: asset sem hash no nome:', [...unhashed, ...stale].join(', '));
  process.exit(1);
}
console.log(`✅ ${renamed.size} assets com hash no nome, ${htmlFiles.length} páginas HTML reescritas`);
