// Gera a página de portfólio do PMLife Labs em _site/:
//   index.html                      -> home com todos os itens (PoCs, spikes, benchmarks)
//   catalogo/<nome>/index.html      -> página de detalhe de cada item (README renderizado)
//   assets/                         -> CSS do site e do realce de código
//
// Cada item (<grupo>/<nome>/) precisa de README.md e labs.json; sem eles o build falha,
// para que nada criado no labs fique fora do portfólio.
//
// Uso: node build.mjs <dir-de-saída>   (chamado por scripts/build-site.sh)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SITE_DIR, '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'));
const REPO = process.env.GITHUB_REPOSITORY ?? 'pvmovel/pmlife-labs';
const REPO_URL = `https://github.com/${REPO}`;

const GROUPS = [
  {
    id: 'pocs',
    label: 'PoC',
    plural: 'PoCs',
    audience: 'Negócio',
    question: 'Dá para o produto fazer isso?',
    description: 'Provas de conceito de rotinas e funcionalidades, demonstráveis a clientes e investidores.',
  },
  {
    id: 'spikes',
    label: 'Spike',
    plural: 'Spikes',
    audience: 'Engenharia',
    question: 'Qual tecnologia ou técnica usar, e ela funciona aqui?',
    description: 'Investigações técnicas com tempo limitado: tecnologias novas, alternativas comparadas, arquitetura, segurança e infra.',
  },
  {
    id: 'benchmarks',
    label: 'Benchmark',
    plural: 'Benchmarks',
    audience: 'Engenharia',
    question: 'Quanto custa, em tempo e recursos?',
    description: 'Medições de desempenho reproduzíveis, com números.',
  },
];

// ---------- utilidades ----------

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${months[m - 1]} ${y}`;
};

const commit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'local';
  }
})();

const builtAt = new Date().toISOString().slice(0, 10);

// ---------- leitura dos itens ----------

function readItems() {
  const items = [];
  const names = new Set();

  for (const group of GROUPS) {
    const groupDir = path.join(ROOT, group.id);
    if (!existsSync(groupDir)) continue;

    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(groupDir, entry.name);
      const files = readdirSync(dir).filter((f) => f !== '.gitkeep');
      if (files.length === 0) continue; // placeholder vazio

      const rel = `${group.id}/${entry.name}`;
      const readme = path.join(dir, 'README.md');
      const manifest = path.join(dir, 'labs.json');
      if (!existsSync(readme)) throw new Error(`${rel}: falta README.md`);
      if (!existsSync(manifest)) throw new Error(`${rel}: falta labs.json (veja o README da raiz)`);

      const meta = JSON.parse(readFileSync(manifest, 'utf8'));
      for (const field of ['title', 'summary', 'problem', 'result', 'date']) {
        if (typeof meta[field] !== 'string' || meta[field].trim() === '') {
          throw new Error(`${rel}/labs.json: campo "${field}" obrigatório`);
        }
      }
      if (!Array.isArray(meta.tags) || meta.tags.length === 0) {
        throw new Error(`${rel}/labs.json: "tags" deve ser uma lista não vazia`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${rel}/labs.json: "date" deve ser AAAA-MM-DD`);
      if (names.has(entry.name)) throw new Error(`${rel}: nome repetido em outro grupo`);
      names.add(entry.name);

      // Demos: `demos` (lista) ou `demo` (uma só) do manifesto; sem elas, o index de public/ ou dist/ publicado.
      let demos = Array.isArray(meta.demos) ? meta.demos : meta.demo ? [meta.demo] : [];
      for (const d of demos) {
        if (typeof d.path !== 'string' || d.path === '') throw new Error(`${rel}/labs.json: toda demo precisa de "path"`);
      }
      if (demos.length === 0) {
        for (const webroot of ['public', 'dist']) {
          const published = path.join(OUT, rel, webroot);
          if (existsSync(published) && readdirSync(published).some((f) => /^index\./.test(f))) {
            demos = [{ path: `${webroot}/`, label: 'Abrir a demo' }];
            break;
          }
        }
      }

      const execPath = path.join(OUT, 'catalogo', entry.name, 'execucao.txt');
      items.push({
        ...meta,
        name: entry.name,
        rel,
        group,
        demos,
        readme: readFileSync(readme, 'utf8'),
        execution: existsSync(execPath) ? readFileSync(execPath, 'utf8').trim() : null,
      });
    }
  }

  return items.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// ---------- markdown ----------

function renderReadme(item) {
  const marked = new Marked(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
    {
      gfm: true,
      // Links relativos do README apontam para o arquivo no GitHub.
      walkTokens(token) {
        if ((token.type === 'link' || token.type === 'image') && !/^(https?:|mailto:|#)/.test(token.href)) {
          const target = path.posix.normalize(`${item.rel}/${token.href}`).replace(/\/$/, '');
          token.href = `${REPO_URL}/tree/main/${target}`;
        }
      },
    },
  );
  // O título já aparece no cabeçalho da página.
  const body = item.readme.replace(/^# .*\n+/, '');
  return marked.parse(body);
}

// ---------- componentes ----------

const icon = {
  github:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5v11l9-5.5z"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3 8h10M9 4l4 4-4 4"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5l3.2 3L13 4.5"/></svg>',
  terminal: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5l3.5 3.5L3 11.5M8.5 11.5H13"/></svg>',
};

const badge = (group) => `<span class="badge badge--${group.id}">${esc(group.label)}</span>`;
const tags = (list) => `<ul class="tags">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

function layout({ title, description, depth, body }) {
  const up = depth === 0 ? './' : '../'.repeat(depth);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧪</text></svg>">
  <link rel="stylesheet" href="${up}assets/labs.css">
  <link rel="stylesheet" href="${up}assets/hljs.css">
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar__inner">
      <a class="brand" href="${up}"><span class="brand__mark">🧪</span><span>PMLife <strong>Labs</strong></span></a>
      <a class="topbar__link" href="${REPO_URL}">${icon.github}<span>GitHub</span></a>
    </div>
  </header>
${body}
  <footer class="footer">
    <div class="wrap footer__inner">
      <span>Gerado automaticamente a partir de <a href="${REPO_URL}">${esc(REPO)}</a> · commit <a href="${REPO_URL}/commit/${commit}"><code>${commit}</code></a> · ${formatDate(builtAt)}</span>
      <span>Cada item passa pelos gates de CI (varredura de segredos, lint, testes) antes de ser publicado.</span>
    </div>
  </footer>
</body>
</html>
`;
}

// ---------- home ----------

function card(item) {
  const detail = `catalogo/${item.name}/`;
  const demoBtn = item.demos.length
    ? `<a class="btn btn--ghost" href="${esc(`${item.rel}/${item.demos[0].path}`)}">${icon.play}<span>Demo</span></a>`
    : '';
  return `      <article class="card" data-group="${item.group.id}">
        <div class="card__head">${badge(item.group)}${item.roadmap ? `<span class="card__ref">${esc(item.roadmap)}</span>` : ''}<time datetime="${item.date}">${formatDate(item.date)}</time></div>
        <h3 class="card__title"><a href="${detail}">${esc(item.title)}</a></h3>
        <p class="card__summary">${esc(item.summary)}</p>
        ${tags(item.tags)}
        <div class="card__actions">
          <a class="btn btn--primary" href="${detail}"><span>Ver detalhes</span>${icon.arrow}</a>
          <a class="btn btn--ghost" href="${REPO_URL}/tree/main/${item.rel}">${icon.github}<span>Código</span></a>
          ${demoBtn}
        </div>
      </article>`;
}

function renderHome(items) {
  const count = (id) => items.filter((i) => i.group.id === id).length;
  const kinds = GROUPS.map(
    (g) => `      <div class="kind kind--${g.id}">
        <div class="kind__top">${badge(g)}<span class="kind__count">${count(g.id)}</span></div>
        <p class="kind__question">“${esc(g.question)}”</p>
        <p class="kind__desc">${esc(g.description)}</p>
        <span class="kind__audience">Público: ${esc(g.audience)}</span>
      </div>`,
  ).join('\n');

  const filters = [
    `<button type="button" class="filter" data-filter="all" aria-pressed="true">Todos <span>${items.length}</span></button>`,
    ...GROUPS.map(
      (g) => `<button type="button" class="filter" data-filter="${g.id}" aria-pressed="false"${count(g.id) === 0 ? ' disabled' : ''}>${esc(g.plural)} <span>${count(g.id)}</span></button>`,
    ),
  ].join('');

  const body = `  <main>
    <section class="hero">
      <div class="wrap">
        <p class="eyebrow">Pesquisa &amp; Desenvolvimento</p>
        <h1>Provas de conceito, spikes e benchmarks da plataforma PMLife</h1>
        <p class="hero__lead">Cada decisão de arquitetura do PMLife (um engine educacional 3D gamificado) é validada aqui antes de chegar ao produto: isolada em um experimento pequeno, documentada, testada no CI e publicada com código aberto e demo.</p>
        <div class="hero__stats">
          <div><strong>${items.length}</strong><span>experimentos</span></div>
          <div><strong>${count('pocs')}</strong><span>PoCs</span></div>
          <div><strong>${count('spikes')}</strong><span>spikes</span></div>
          <div><strong>${count('benchmarks')}</strong><span>benchmarks</span></div>
        </div>
      </div>
    </section>

    <section class="wrap section">
      <h2 class="section__title">Como o labs é organizado</h2>
      <div class="kinds">
${kinds}
      </div>
    </section>

    <section class="wrap section" id="catalogo">
      <div class="section__bar">
        <h2 class="section__title">Catálogo</h2>
        <div class="filters" role="group" aria-label="Filtrar por tipo" hidden>${filters}</div>
      </div>
      <div class="grid">
${items.map(card).join('\n')}
      </div>
      <p class="empty" hidden>Nenhum item nesta categoria ainda.</p>
    </section>
  </main>
  <script>
    (() => {
      const bar = document.querySelector('.filters');
      const cards = [...document.querySelectorAll('.card')];
      const empty = document.querySelector('.empty');
      bar.hidden = false;
      bar.addEventListener('click', (event) => {
        const button = event.target.closest('.filter');
        if (!button || button.disabled) return;
        const value = button.dataset.filter;
        bar.querySelectorAll('.filter').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        let visible = 0;
        cards.forEach((c) => {
          const show = value === 'all' || c.dataset.group === value;
          c.hidden = !show;
          if (show) visible++;
        });
        empty.hidden = visible > 0;
      });
    })();
  </script>`;

  return layout({
    title: 'PMLife Labs: PoCs, spikes e benchmarks',
    description: 'Portfólio público de P&D da plataforma PMLife: provas de conceito, spikes técnicos e benchmarks com código aberto, CI e demos.',
    depth: 0,
    body,
  });
}

// ---------- detalhe ----------

function renderDetail(item) {
  const up = '../../';
  const hasDemo = item.demos.length > 0;
  const actions = [
    ...item.demos.map(
      (d, i) =>
        `<a class="btn ${i === 0 ? 'btn--primary' : 'btn--ghost'}" href="${esc(`${up}${item.rel}/${d.path}`)}">${icon.play}<span>${esc(d.label ?? 'Abrir a demo')}</span></a>`,
    ),
    `<a class="btn ${hasDemo ? 'btn--ghost' : 'btn--primary'}" href="${REPO_URL}/tree/main/${item.rel}">${icon.github}<span>Ver o código</span></a>`,
    item.execution ? `<a class="btn btn--ghost" href="#execucao">${icon.check}<span>Execução no CI</span></a>` : '',
    item.run ? `<a class="btn btn--ghost" href="#rodar">${icon.terminal}<span>Rodar localmente</span></a>` : '',
  ].join('\n          ');

  const notes = item.demos.filter((d) => d.note);
  const demoNote = notes.length
    ? `<div class="callout"><strong>Sobre ${notes.length > 1 ? 'as demos' : 'a demo'}:</strong>${notes.length > 1 ? `<ul>${notes.map((d) => `<li><strong>${esc(d.label ?? d.path)}:</strong> ${esc(d.note)}</li>`).join('')}</ul>` : ` ${esc(notes[0].note)}`}</div>`
    : '';

  const execution = item.execution
    ? `      <section class="panel" id="execucao">
        <h2>${icon.check} Execução verificada no CI</h2>
        <p class="panel__hint">Saída real de <code>yarn verify</code>, gravada no build que publicou esta página (commit <a href="${REPO_URL}/commit/${commit}"><code>${commit}</code></a>). Se algum check falhar, o deploy não acontece. <a href="${REPO_URL}/actions/workflows/ci.yml">Histórico do CI</a> · <a href="execucao.txt">saída bruta</a></p>
        <pre class="terminal"><code>${esc(item.execution)}</code></pre>
      </section>`
    : '';

  const run = item.run
    ? `      <section class="panel" id="rodar">
        <h2>${icon.terminal} Rodar localmente</h2>
        <p class="panel__hint">Na pasta <code>${esc(item.rel)}</code> do repositório (<code>git clone ${REPO_URL}.git</code>):</p>
        <div class="copy"><pre class="terminal"><code>${esc(item.run)}</code></pre><button type="button" class="copy__btn" data-copy>Copiar</button></div>
      </section>`
    : '';

  const body = `  <main class="wrap detail">
    <nav class="crumbs" aria-label="Navegação"><a href="${up}">Labs</a><span>/</span><a href="${up}#catalogo">${esc(item.group.plural)}</a><span>/</span><span>${esc(item.name)}</span></nav>
    <header class="detail__head">
      <div class="card__head">${badge(item.group)}${item.roadmap ? `<span class="card__ref">Roadmap ${esc(item.roadmap)}</span>` : ''}<time datetime="${item.date}">${formatDate(item.date)}</time></div>
      <h1>${esc(item.title)}</h1>
      <p class="detail__lead">${esc(item.summary)}</p>
      ${tags(item.tags)}
      <div class="detail__actions">
          ${actions}
      </div>
      ${demoNote}
    </header>

    <div class="pr">
      <section class="pr__box pr__box--problem"><h2>Problema</h2><p>${esc(item.problem)}</p></section>
      <section class="pr__box pr__box--result"><h2>Resultado</h2><p>${esc(item.result)}</p></section>
    </div>

${execution}
${run}
    <article class="doc">
      <h2 class="doc__title">Documentação completa</h2>
${renderReadme(item)}
    </article>
  </main>
  <script>
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const text = button.previousElementSibling.innerText;
        try { await navigator.clipboard.writeText(text); button.textContent = 'Copiado'; }
        catch { button.textContent = 'Selecione e copie'; }
        setTimeout(() => (button.textContent = 'Copiar'), 1800);
      });
    });
  </script>`;

  return layout({ title: `${item.title} · PMLife Labs`, description: item.summary, depth: 2, body });
}

// ---------- build ----------

const items = readItems();

mkdirSync(path.join(OUT, 'assets'), { recursive: true });
copyFileSync(path.join(SITE_DIR, 'labs.css'), path.join(OUT, 'assets', 'labs.css'));
const hljsStyles = path.join(SITE_DIR, 'node_modules', 'highlight.js', 'styles');
writeFileSync(
  path.join(OUT, 'assets', 'hljs.css'),
  `${readFileSync(path.join(hljsStyles, 'github.css'), 'utf8')}\n@media (prefers-color-scheme: dark) {\n${readFileSync(path.join(hljsStyles, 'github-dark.css'), 'utf8')}\n}\n`,
);

writeFileSync(path.join(OUT, 'index.html'), renderHome(items));
for (const item of items) {
  const dir = path.join(OUT, 'catalogo', item.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), renderDetail(item));
}

console.log(`catálogo: ${items.length} item(ns) -> ${items.map((i) => i.rel).join(', ') || '(nenhum)'}`);
