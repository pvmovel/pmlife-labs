// Prova na demo, com cliques reais no Chrome headless, o roteiro da sincronização:
//   1. celular offline conclui 2 missões: valem na hora, ficam na fila, o servidor não vê nada;
//   2. computador de visitante conclui 1 missão e entra na conta: leva a missão para o servidor;
//   3. celular com "perde a resposta" sincroniza: o servidor grava, mas a fila continua; voltando ao online, reenvia;
//      o servidor recebe o lote de novo e continua com uma linha por missão (XP nunca em dobro);
//   4. os dois aparelhos convergem para as mesmas missões e o mesmo XP;
//   e nenhum erro na página nem requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4191;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await build({ logLevel: 'warn', base: '/', build: { outDir: OUT, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  const foreign = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host && host !== `localhost:${PORT}`) foreign.add(host);
  });
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('[data-testid="device-phone"]');

  const device = (id) => page.$eval(`[data-testid="device-${id}"]`, (el) => ({ xp: +el.dataset.xp, pending: +el.dataset.pending, completed: el.dataset.completed.split(',').filter(Boolean).sort() }));
  const srv = () => page.$eval('[data-testid="server"]', (el) => ({ rows: +el.dataset.rows, received: +el.dataset.received }));
  const click = async (id, selector) => {
    await page.click(`[data-testid="device-${id}"] ${selector}`);
    await sleep(150);
  };
  const clickText = async (id, text) => {
    await page.$$eval(`[data-testid="device-${id}"] button`, (bs, t) => bs.find((b) => b.textContent.trim() === t)?.click(), text);
    await sleep(150);
  };

  // 1. Celular offline.
  await clickText('phone', 'Offline');
  await click('phone', '[data-quest="fases-da-lua"]');
  await click('phone', '[data-quest="eclipse"]');
  await clickText('phone', 'Sincronizar');
  let p = await device('phone');
  check(p.xp === 1300 && p.pending === 2 && (await srv()).rows === 0, 'Gherkin: offline, as missões valem na hora no celular e ficam na fila; o servidor não vê nada', `XP ${p.xp}, fila ${p.pending}`);

  // 2. Computador de visitante entra na conta.
  await click('pc', '[data-quest="constelacoes"]');
  await clickText('pc', 'Entrar na conta');
  let c = await device('pc');
  check(c.xp === 500 && c.pending === 0 && (await srv()).rows === 1, 'o visitante que entra na conta leva a missão que fez neste navegador', `XP ${c.xp}, servidor ${(await srv()).rows} linha`);

  // 3. Resposta perdida e reenvio.
  await clickText('phone', 'Perde a resposta');
  await clickText('phone', 'Sincronizar');
  p = await device('phone');
  let s = await srv();
  check(s.rows === 3 && p.pending === 2, 'com a resposta perdida, o servidor grava, mas o celular mantém a fila (não sabe que deu certo)', `servidor ${s.rows} linhas, fila ${p.pending}`);
  const before = s.received;
  await clickText('phone', 'Online');
  p = await device('phone');
  s = await srv();
  check(s.received === before + 1 && s.rows === 3 && p.pending === 0, 'Gherkin: voltando a rede, o celular reenvia o mesmo lote e o servidor continua com uma linha por missão', `lotes ${before} ➔ ${s.received}, linhas ${s.rows}`);
  check(p.xp === 1800, 'Gherkin: XP nunca em dobro (300 + 1000 + 500)', `XP ${p.xp}`);

  // 4. Convergência.
  await clickText('pc', 'Sincronizar');
  c = await device('pc');
  check(c.xp === 1800 && JSON.stringify(c.completed) === JSON.stringify(p.completed), 'Gherkin: o computador mostra as missões do celular depois da sincronização', c.completed.join(', '));
  await click('pc', '[data-quest="montar-telescopio"]');
  await clickText('pc', 'Sincronizar');
  await clickText('phone', 'Sincronizar');
  p = await device('phone');
  c = await device('pc');
  check(p.xp === 2500 && c.xp === 2500 && (await srv()).rows === 4, 'os dois aparelhos convergem: 4 missões e 2.500 XP em cada um, 4 linhas no servidor');

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem', [...foreign].join(', '));
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(OUT, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
