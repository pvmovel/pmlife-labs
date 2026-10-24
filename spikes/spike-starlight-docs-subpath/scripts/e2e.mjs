// Prova, no Chrome headless e com um build de verdade NUM SUBCAMINHO (/sub/docs/, como /architecture/ no produto):
//   1. as páginas existem nos dois idiomas e o seletor leva de uma para a outra;
//   2. a busca (Pagefind) funciona no subcaminho, em português e em inglês;
//   3. explorador de arquivos, diagrama das camadas e "siga uma funcionalidade" respondem ao clique;
//   4. os números vêm do mapa do repositório;
//   5. nada sensível no site gerado (varredura de todos os arquivos de texto);
//   6. cache: assets com hash; o que a busca baixa sem hash no nome não muda entre dois builds com conteúdo diferente
//      (só muda com a versão do Pagefind, e o smoke confere essa versão no ar);
//   e nenhum erro na página nem requisição a outra origem.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const OUT2 = '.e2e-dist-2';
const EXTRA_PAGE = 'src/content/docs/e2e-pagina-extra.md';
const BASE = '/sub/docs/';
const PORT = 4192;
const ORIGIN = `http://localhost:${PORT}`;
const FORBIDDEN = [/\.env\.php/, /\/home\d*\//, /public_html/, /\b(DB_PASS|API_KEY|SALT)=/];

const chrome =
  process.env.CHROME_PATH ??
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!chrome) {
  console.error('ERRO: Chrome/Chromium não encontrado (defina CHROME_PATH).');
  process.exit(1);
}

let failed = false;
const check = (ok, msg, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${msg}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed = true;
};

execFileSync('npx', ['astro', 'build', '--outDir', OUT, '--base', BASE], { stdio: 'ignore' });
// Segundo build com uma página a mais: o que muda nele precisa ter hash no nome ou ser JSON (no-cache).
writeFileSync(EXTRA_PAGE, '---\ntitle: "Página extra do e2e"\n---\n\nAbóboras, tomates e alfaces mudam o índice da busca.\n');
try {
  execFileSync('npx', ['astro', 'build', '--outDir', OUT2, '--base', BASE], { stdio: 'ignore' });
} finally {
  rmSync(EXTRA_PAGE, { force: true });
}
const sha = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');

// 5. Varredura do que seria publicado.
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : files.push(path.join(d, f))));
walk(OUT);
const textual = files.filter((f) => /\.(html|js|css|json|txt|xml|svg)$/.test(f));
const leaks = textual.flatMap((f) => FORBIDDEN.filter((rx) => rx.test(readFileSync(f, 'utf8'))).map((rx) => `${path.relative(OUT, f)}: ${rx}`));
check(leaks.length === 0, `nada sensível nos ${textual.length} arquivos de texto do site gerado`, leaks.join(', '));
check(!files.some((f) => /\.(ts|tsx|php)$/.test(f)), 'nenhum código-fonte (.ts, .tsx, .php) publicado');

// Servidor estático que imita a hospedagem: o site só existe dentro do subcaminho.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (!url.pathname.startsWith(BASE)) return res.writeHead(404).end();
  let file = path.join(OUT, decodeURIComponent(url.pathname.slice(BASE.length)));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  const foreign = new Set();
  const requested = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.protocol.startsWith('http')) return; // data: e blob: são locais
    if (u.origin !== ORIGIN) foreign.add(u.host);
    else requested.add(u.pathname);
  });
  page.on('requestfinished', (r) => {
    if (r.response()?.status() >= 400) errors.push(`${r.response().status()} ${r.url()}`);
  });
  await page.setViewport({ width: 1280, height: 900 });
  const go = async (p) => {
    await page.goto(ORIGIN + BASE + p, { waitUntil: 'networkidle0' });
  };

  // 1. Idiomas.
  await go('');
  const ptTitle = await page.$eval('h1', (h) => h.textContent.trim());
  const lang = await page.$eval('html', (h) => h.lang);
  await page.select('starlight-lang-select select', `${BASE}en/`);
  await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 10000 });
  const enTitle = await page.$eval('h1', (h) => h.textContent.trim());
  check(ptTitle === 'Visão do produto' && lang === 'pt-BR' && enTitle === 'Product vision', 'Gherkin: a mesma página existe em português e inglês, com o seletor de idioma', `${ptTitle} ➔ ${enTitle}`);

  // 4. Números.
  const numbers = await page.$$eval('[data-testid="live-numbers"] strong', (s) => s.map((x) => x.textContent.trim()));
  check(numbers[0] === '16' && numbers[1] === '9' && numbers[2] === '12', 'números vêm do mapa: 16 arquivos, 9 nas camadas, 12 sem achados', numbers.join(' · '));

  // 2. Busca no subcaminho, nos dois idiomas.
  const search = async (term) => {
    await page.click('button[data-open-modal]');
    await page.waitForSelector('#starlight__search input', { visible: true, timeout: 10000 });
    await page.type('#starlight__search input', term);
    await page.waitForSelector('#starlight__search .pagefind-ui__result-link', { timeout: 15000 });
    const hits = await page.$$eval('#starlight__search .pagefind-ui__result-link', (as) => as.map((a) => a.getAttribute('href')));
    await page.keyboard.press('Escape');
    return hits;
  };
  const enHits = await search('adapter');
  await go('');
  const ptHits = await search('canteiro');
  check(enHits.length > 0 && enHits.every((h) => h.startsWith(`${BASE}en/`)), 'busca em inglês acha páginas em inglês, dentro do subcaminho', enHits[0]);
  check(ptHits.length > 0 && ptHits.every((h) => h.startsWith(BASE) && !h.startsWith(`${BASE}en/`)), 'busca em português acha páginas em português, dentro do subcaminho', ptHits[0]);

  // 3a. Diagrama das camadas.
  await go('arquitetura/camadas/');
  await page.waitForSelector('[data-testid="layer-diagram"] button[data-layer="domain"]');
  await page.click('[data-testid="layer-diagram"] button[data-layer="domain"]');
  const domainCannot = await page.$eval('[data-testid="cannot-import"]', (e) => e.textContent);
  await page.click('[data-testid="layer-diagram"] button[data-layer="composition-root"]');
  const rootCan = await page.$eval('[data-testid="can-import"]', (e) => e.textContent);
  const infraState = await page.$eval('button[data-layer="infrastructure"]', (b) => b.dataset.state);
  check(/Application/.test(domainCannot) && /Infrastructure/.test(domainCannot) && /Infrastructure/.test(rootCan) && infraState === 'allowed', 'diagrama: o Domain não importa nada de fora; o Composition Root é quem importa a Infrastructure', `${rootCan.trim()}`);

  // 3b. Explorador.
  await go('arquitetura/arquivos/');
  await page.waitForSelector('[data-testid="file-explorer"] input[type="search"]');
  const filterBox = '[data-testid="file-explorer"] input[type="search"]';
  const clearFilter = () => page.$eval(filterBox, (i) => (i.value = '')).then(() => page.type(filterBox, ' ')).then(() => page.keyboard.press('Backspace'));
  await page.type(filterBox, 'RegistrarColheita');
  await page.click('button[data-file="src/Application/UseCases/RegistrarColheitaUseCase.ts"]');
  await clearFilter();
  let desc = await page.$eval('[data-testid="file-description"]', (e) => e.textContent);
  const layer = await page.$eval('[data-testid="file-details"] [data-layer]', (e) => e.dataset.layer);
  await page.$$eval('[data-testid="file-details"] button', (bs) => bs.find((b) => b.textContent.includes('Dependencias.tsx'))?.click());
  await page.waitForFunction(() => document.querySelector('[data-testid="file-details"]').textContent.includes('Composition Root'));
  const jumped = await page.$eval('[data-testid="file-description"]', (e) => e.textContent);
  check(desc.startsWith('Caso de uso: registra a colheita') && layer === 'application' && jumped.startsWith('Composition Root'), 'explorador: o arquivo mostra função e camada, e "Usado por" leva ao arquivo que o usa');
  await page.type(filterBox, 'webroot');
  await page.click('button[data-file="backend/api/canteiros.php"]');
  desc = await page.$eval('[data-testid="file-description"]', (e) => e.textContent);
  check(desc.includes('[arquivo de ambiente]') && desc.includes('[pasta do servidor]'), 'explorador: o filtro acha pela função, e o detalhe sensível aparece sanitizado', desc.slice(0, 90));
  await go('en/arquitetura/arquivos/');
  await page.waitForSelector(filterBox);
  await page.type(filterBox, 'Canteiro.ts');
  await page.click('button[data-file="src/Domain/Entities/Canteiro.ts"]');
  desc = await page.$eval('[data-testid="file-description"]', (e) => e.textContent);
  check(desc.startsWith('Garden bed entity'), 'explorador em inglês mostra a descrição em inglês', desc.slice(0, 40));

  // 3c. Siga uma funcionalidade.
  await go('arquitetura/funcionalidade/');
  await page.waitForSelector('[data-testid="walkthrough"] button');
  const layersSeen = [await page.$eval('[data-testid="walk-layer"]', (e) => e.dataset.layer)];
  for (let i = 0; i < 4; i++) {
    await page.$$eval('[data-testid="walkthrough"] button', (bs) => bs.find((b) => b.textContent.includes('Próximo'))?.click());
    layersSeen.push(await page.$eval('[data-testid="walk-layer"]', (e) => e.dataset.layer));
  }
  const nextDisabled = await page.$$eval('[data-testid="walkthrough"] button', (bs) => bs.find((b) => b.textContent.includes('Próximo')).disabled);
  check(layersSeen.join('>') === 'presentation>application>domain>infrastructure>backend' && nextDisabled, 'funcionalidade: 5 passos atravessam as camadas, de fora para dentro e de volta para fora', layersSeen.join(' ➔ '));

  // 6. Cache: o que a busca baixou.
  const pf = [...requested].filter((p) => p.includes('/pagefind/')).map((p) => p.slice(p.indexOf('/pagefind/') + 10));
  const unhashed = [...new Set(pf.filter((f) => !/\.pf_(meta|index|fragment)$/.test(f) && !f.endsWith('.json')))];
  const changed = unhashed.filter((f) => sha(path.join(OUT, 'pagefind', f)) !== sha(path.join(OUT2, 'pagefind', f)));
  const entryChanged = sha(path.join(OUT, 'pagefind/pagefind-entry.json')) !== sha(path.join(OUT2, 'pagefind/pagefind-entry.json'));
  check(unhashed.length > 0 && changed.length === 0 && entryChanged, `a busca baixa ${unhashed.length} arquivos sem hash, e nenhum muda quando o conteúdo muda (só o índice JSON, no-cache)`, unhashed.join(', '));
  const assets = [...requested].filter((p) => /\.(js|css)$/.test(p) && !p.includes('/pagefind/'));
  check(assets.every((p) => p.startsWith(`${BASE}assets/`) && /\.[\w-]{8}\.(js|css)$/.test(p)), `todo JS/CSS do site fica em assets/ com hash no nome (${assets.length})`);
  const pfVersion = /pagefind_version="([^"]+)"/.exec(readFileSync(path.join(OUT, 'pagefind/pagefind.js'), 'utf8'))?.[1];
  const entryVersion = JSON.parse(readFileSync(path.join(OUT, 'pagefind/pagefind-entry.json'), 'utf8')).version;
  check(!!pfVersion && pfVersion === entryVersion, 'a versão do pagefind.js é a do índice (é o que o smoke confere no ar)', pfVersion);

  check(errors.length === 0, 'nenhum erro na página nem arquivo faltando', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem', [...foreign].join(', '));
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  server.close();
  rmSync(OUT, { recursive: true, force: true });
  rmSync(OUT2, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
