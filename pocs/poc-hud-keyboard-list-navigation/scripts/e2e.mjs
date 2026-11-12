// Prova com teclas, cliques e toques reais no Chrome headless os cenários da US52:
//   1. andando com as setas até o Portal das fases, E abre a janela com o foco na lista e o destaque na fase em andamento;
//   2. a tecla 3 entra na 3ª fase; →, → e 0 entram na 30ª; a fase bloqueada fica, com o motivo;
//   3. segurar as setas com a janela aberta troca a página e não anda com o avatar;
//   4. nas Matrículas, o número do curso por código leva ao campo; digitar o código (com números) não escolhe outro curso;
//   5. num celular emulado (toque, 390 px): tocar no prédio e no curso funciona, as teclas somem e nada passa da largura.
// E nenhum erro na página nem requisição a outra origem.
import { existsSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4194;
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
  const errors = [];
  const foreign = new Set();
  const watch = async (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host !== `localhost:${PORT}` && url.protocol !== 'data:') foreign.add(url.host);
      r.continue();
    });
  };
  const avatar = (page) => page.$eval('[data-testid=avatar]', (el) => ({ x: Number(el.dataset.x), y: Number(el.dataset.y) }));
  const place = (page) => page.$eval('[data-testid=place]', (el) => el.textContent);
  const hold = async (page, key, ms) => {
    await page.keyboard.down(key);
    await sleep(ms);
    await page.keyboard.up(key);
  };
  const focusedRole = (page) => page.evaluate(() => document.activeElement?.getAttribute('role'));
  const activeOption = (page) => page.$eval('[role=option][aria-selected=true]', (el) => el.textContent);
  const pageText = (page) => page.$eval('[data-testid=page]', (el) => el.textContent);

  // --- Computador: só o teclado ---
  const page = await browser.newPage();
  await watch(page);
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL_, { waitUntil: 'networkidle0' });

  await hold(page, 'ArrowRight', 1300);
  await hold(page, 'ArrowUp', 650);
  const prompt = await page.$eval('.prompt', (el) => el.textContent);
  check(prompt.includes('Portal das fases'), 'as setas levam o avatar até o Portal das fases', prompt);
  await page.keyboard.press('e');
  await page.waitForSelector('[role=dialog]');
  check((await focusedRole(page)) === 'listbox', 'E abre a janela com o foco na lista, não no Fechar');
  check((await activeOption(page)).includes('Fase 4'), 'o destaque abre na fase em andamento', await activeOption(page));

  await page.keyboard.press('3');
  await sleep(50);
  check(!(await page.$('[role=dialog]')) && (await place(page)).includes('Fase 3'), 'a tecla 3 entra na 3ª fase', await place(page));

  await page.keyboard.press('e');
  await page.waitForSelector('[role=listbox]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check((await pageText(page)) === 'Página 3 de 3', '→ e → vão à página 3 de 3', await pageText(page));
  await page.keyboard.press('0');
  await sleep(50);
  check((await place(page)).includes('Fase 30'), 'o 0 da página 3 entra na 30ª fase', await place(page));

  await page.keyboard.press('e');
  await page.waitForSelector('[role=listbox]');
  await page.keyboard.press('6');
  await sleep(50);
  const said = await page.$eval('[data-testid=said]', (el) => el.textContent);
  check(!!(await page.$('[role=dialog]')) && said.includes('bloqueada'), 'a fase 6 (bloqueada) não abre e o motivo é lido', said);

  const before = await avatar(page);
  await hold(page, 'ArrowRight', 600);
  await hold(page, 'ArrowLeft', 300);
  const after = await avatar(page);
  check(before.x === after.x && before.y === after.y, 'segurar as setas com a janela aberta não anda com o avatar', `${before.x},${before.y} -> ${after.x},${after.y}`);
  await page.keyboard.press('Escape');
  check(!(await page.$('[role=dialog]')), 'Esc fecha a janela');

  await hold(page, 'ArrowLeft', 1250);
  await hold(page, 'ArrowDown', 1450);
  await page.keyboard.press('e');
  await page.waitForSelector('[role=listbox]');
  await page.keyboard.press('3');
  await sleep(50);
  const inInput = await page.evaluate(() => document.activeElement?.id);
  check(inInput === 'enroll-code', 'nas Matrículas, o 3 (curso por código) leva ao campo do código', inInput);
  await page.keyboard.type('aurora-2026');
  check((await page.$eval('#enroll-code', (el) => el.value)) === 'aurora-2026', 'os números digitados no campo ficam no campo');
  await page.keyboard.press('Enter');
  await sleep(50);
  const done = await page.$eval('[data-testid=enroll-message]', (el) => el.textContent);
  check(done.includes('Pronúncia'), 'Enter envia o código e matricula', done);
  check((await focusedRole(page)) === 'listbox', 'depois do código, o foco volta à lista');
  await page.close();

  // --- Celular: toque ---
  const phone = await browser.newPage();
  await watch(phone);
  await phone.emulate(KnownDevices['iPhone 13']);
  await phone.goto(URL_, { waitUntil: 'networkidle0' });
  await phone.tap('[data-building="courses-portal"]');
  await phone.waitForSelector('[role=option]');
  const slotHidden = await phone.$eval('.slot', (el) => getComputedStyle(el).display === 'none');
  const coarse = await phone.evaluate(() => matchMedia('(pointer: coarse)').matches);
  check(!coarse || slotHidden, 'no toque, as teclas não aparecem', `pointer coarse: ${coarse}`);
  const options = await phone.$$('[role=option]');
  await options[1].tap();
  await sleep(50);
  check((await place(phone)).includes('Inglês intermediário'), 'tocar no curso leva até ele', await place(phone));
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, 'nada passa da largura do celular', `${overflow}px`);
  await phone.close();

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem', [...foreign].join(', '));
} finally {
  await browser?.close();
  server.httpServer.close();
}

if (failed) process.exit(1);
console.log('e2e ok');
