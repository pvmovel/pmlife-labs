// Prova no navegador real (Chrome headless) o que o Node não consegue: o banco persiste no OPFS.
//   1. primeira visita: OPFS ativo, schema migrado do zero, progresso vazio;
//   2. concluir missões, recarregar: o progresso volta do banco, sem migrar de novo;
//   3. fechar o navegador e abrir de novo (mesmo perfil): o progresso continua;
//   4. segunda aba com a primeira aberta: o pool do opfs-sahpool é exclusivo (registra o que acontece);
//   5. sem OPFS (simulado): cai para memória e mostra o aviso;
//   6. apagar dados; e mede o desempenho (saída publicada na página do portfólio).
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4179;
const URL_ = `http://localhost:${PORT}/`;

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

await build({ logLevel: 'warn', base: '/', build: { outDir: OUT, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });
const profile = mkdtempSync(path.join(tmpdir(), 'sqlite-wasm-e2e-'));
const launch = () =>
  puppeteer.launch({ executablePath: chrome, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] });

const text = (page, id) => page.$eval(`[data-testid="${id}"]`, (el) => el.textContent.trim());
const mode = (page) => page.$eval('[data-testid="mode"]', (el) => el.dataset.mode);
const open = async (page, url = URL_) => {
  await page.goto(url);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 20000 });
};

let browser;
try {
  browser = await launch();
  let page = await browser.newPage();
  page.on('pageerror', (e) => check(false, 'erro na página', e.message));

  // 1. Primeira visita
  await open(page);
  check((await mode(page)) === 'opfs', 'primeira visita: SQLite com OPFS ativo');
  check((await text(page, 'schema')).includes('aplicadas agora: 1, 2'), 'schema migrado do zero', await text(page, 'schema'));
  check((await text(page, 'xp')) === '0', 'progresso começa vazio');
  const timings = await text(page, 'timings');

  // 2. Concluir duas missões e recarregar
  await page.click('[data-testid="complete"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="xp"]').textContent === '150');
  await page.click('[data-testid="complete"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="xp"]').textContent === '300');
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  check((await text(page, 'xp')) === '300', 'depois de recarregar: XP veio do banco', `XP ${await text(page, 'xp')}`);
  check((await text(page, 'missions')) === 'missao-1, missao-2', 'missões na ordem de conclusão', await text(page, 'missions'));
  check((await text(page, 'schema')).includes('nada a migrar'), 'reabrir não migra de novo');

  // 4. Segunda aba com a primeira aberta
  const second = await browser.newPage();
  await open(second);
  const secondMode = await mode(second);
  const secondWarning = secondMode === 'memory' ? await text(second, 'warning') : '';
  console.log(`ℹ️  segunda aba com a primeira aberta: modo "${secondMode}"${secondWarning ? ` — ${secondWarning}` : ''}`);
  await second.close();

  // 3. Fechar o navegador e abrir de novo
  await browser.close();
  browser = await launch();
  page = await browser.newPage();
  await open(page);
  check((await text(page, 'xp')) === '300', 'depois de fechar e abrir o navegador: progresso continua');

  // 6. Desempenho
  await page.click('[data-testid="bench"]');
  await page.waitForSelector('[data-testid="bench-result"]:not([hidden])', { timeout: 30000 });
  const bench = JSON.parse(await page.$eval('[data-testid="bench-result"]', (el) => el.dataset.json));
  check(bench.rows === 1000, 'benchmark executado');

  // 5. Sem OPFS
  const noOpfs = await browser.newPage();
  await open(noOpfs, `${URL_}?sem-opfs`);
  check((await mode(noOpfs)) === 'memory', 'sem OPFS: cai para memória');
  check(!(await noOpfs.$eval('[data-testid="warning"]', (el) => el.hidden)), 'sem OPFS: aviso visível', await text(noOpfs, 'warning'));
  await noOpfs.close();

  // Apagar dados
  await page.click('[data-testid="clear"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="xp"]').textContent === '0');
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  check((await text(page, 'xp')) === '0', 'apagar dados: vazio depois de recarregar');

  const ua = await browser.version();
  console.log(`\n--- desempenho (${ua}, headless, nesta máquina) ---`);
  console.log(`abertura: ${timings}`);
  console.log(`inserir ${bench.rows} linhas numa transação: ${bench.insertBatchMs} ms`);
  console.log(`ler ${bench.rows} linhas: ${bench.readAllMs} ms`);
  console.log(`gravação avulsa (média de ${bench.singleWrites}): ${bench.singleWriteAvgMs} ms`);
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(profile, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
