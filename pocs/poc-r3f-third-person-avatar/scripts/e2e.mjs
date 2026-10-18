// Prova com teclas reais no Chrome headless (WebGL por software) o que os testes unitários não mostram:
//   1. W anda até a parede da biblioteca e para (não atravessa);
//   2. as setas fazem o mesmo que WASD: gira 180° e anda até a borda do mapa, e para;
//   3. no modo Orbital as teclas não movem o avatar; o botão e a tecla C alternam os modos;
//   4. nenhum erro na página e nenhuma requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4183;
const URL_ = `http://localhost:${PORT}/`;
const WALL_Z = 2 + 0.5; // face sul da biblioteca (z = 2) + meia largura do avatar
const EDGE_Z = 15 - 0.5; // borda do mapa (halfSize 15) − meia largura do avatar

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

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  const foreign = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host && host !== `localhost:${PORT}`) foreign.add(host);
  });
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('canvas', { timeout: 30000 });

  const avatar = () => page.$eval('[data-testid="avatar"]', (el) => ({ x: +el.dataset.x, z: +el.dataset.z, h: +el.dataset.heading }));
  const pressed = () => page.$eval('[aria-pressed="true"][aria-keyshortcuts="C"]', (el) => el.textContent);
  /** Segura a tecla até a condição valer (o FPS do Chrome headless varia; a prova não depende de tempo fixo). */
  const holdUntil = async (key, condition, arg) => {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(condition, { timeout: 30000, polling: 50 }, arg);
    } finally {
      await page.keyboard.up(key);
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  check((await pressed()) === 'Avatar', 'abre no modo Avatar (mouse e teclado)');
  const start = await avatar();

  // 1. W até a parede, e continua segurando: não pode atravessar
  await holdUntil('KeyW', (z) => +document.querySelector('[data-testid="avatar"]').dataset.z <= z + 0.05, WALL_Z);
  await page.keyboard.down('KeyW');
  await sleep(800);
  await page.keyboard.up('KeyW');
  await sleep(200);
  const atWall = await avatar();
  check(atWall.z < start.z, 'W anda para a frente', `z ${start.z.toFixed(1)} ➔ ${atWall.z.toFixed(2)}`);
  check(Math.abs(atWall.z - WALL_Z) < 0.05, 'para na parede da biblioteca e não atravessa', `z ${atWall.z.toFixed(2)}, parede em ${WALL_Z}`);

  // 2. Setas: ← gira até olhar para +z (heading 2π), ↑ anda até a borda e para
  await holdUntil('ArrowLeft', (h) => +document.querySelector('[data-testid="avatar"]').dataset.heading >= h, 2 * Math.PI - 0.08);
  await holdUntil('ArrowUp', (z) => +document.querySelector('[data-testid="avatar"]').dataset.z >= z - 0.05, EDGE_Z);
  await page.keyboard.down('ArrowUp');
  await sleep(800);
  await page.keyboard.up('ArrowUp');
  await sleep(200);
  const atEdge = await avatar();
  check(Math.abs(atEdge.z - EDGE_Z) < 0.05, 'setas: gira com ← e anda com ↑ até a borda do mapa, e para', `z ${atEdge.z.toFixed(2)}, borda em ${EDGE_Z}`);
  check((await page.evaluate(() => window.scrollY)) === 0, 'as setas não rolam a página no modo Avatar');

  // 3. Orbital: as teclas não movem o avatar; botão e tecla C alternam
  await page.click('button[aria-keyshortcuts="C"]:not([aria-pressed="true"])');
  check((await pressed()) === 'Orbital', 'o botão passa para a visão Orbital');
  const before = await avatar();
  await page.keyboard.down('KeyS');
  await sleep(800);
  await page.keyboard.up('KeyS');
  check((await avatar()).z === before.z, 'no modo Orbital as teclas não movem o avatar');
  await page.keyboard.press('KeyC');
  check((await pressed()) === 'Avatar', 'a tecla C volta para o modo Avatar');

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem (fonte local, sem CDN)', [...foreign].join(', '));
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(OUT, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
