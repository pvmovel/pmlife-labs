// Prova com toque real num celular emulado no Chrome headless (WebGL por software):
//   1. o campus abre no Orbital, sem joystick; o botão Avatar mostra o joystick no canto inferior esquerdo;
//   2. arrastar o joystick para cima anda para a frente; soltar para;
//   3. andando até a Biblioteca, aparece o aviso (no alto da cena, sem cobrir o joystick); tocar em Entrar abre a sala,
//      o joystick some e o avatar fica parado; fechando a sala, o joystick volta;
//   4. arrastar para a esquerda e para a direita gira para o mesmo lado;
//   5. com mouse e teclado o joystick não aparece e o W continua andando;
//   e nenhum erro nem requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4189;
const URL_ = `http://localhost:${PORT}/`;
const PULL = 45; // px: arraste do pino (o raio do joystick é 56 px)

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
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

await build({ logLevel: 'warn', base: '/', build: { outDir: OUT, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const foreign = new Set();
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const host = new URL(r.url()).host;
      if (host && host !== `localhost:${PORT}`) foreign.add(host);
    });
  };

  // ---------- Celular (toque) ----------
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('canvas', { timeout: 30000 });
  await sleep(1000);

  const avatar = () => phone.$eval('[data-testid="avatar"]', (el) => ({ x: +el.dataset.x, z: +el.dataset.z, h: +el.dataset.heading }));
  const pressed = () => phone.$eval('[aria-pressed="true"][aria-keyshortcuts="C"]', (el) => el.textContent);
  const joystickBox = () => phone.$('[data-testid="joystick"]').then((el) => el?.boundingBox() ?? null);
  /** Segura o dedo no joystick, puxado (dx, dy) a partir do centro, até a condição valer na página. */
  const holdUntil = async ([dx, dy], condition, arg) => {
    const box = await joystickBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await phone.touchscreen.touchStart(cx, cy);
    try {
      for (let i = 1; i <= 5; i++) await phone.touchscreen.touchMove(cx + (dx * i) / 5, cy + (dy * i) / 5);
      await phone.waitForFunction(condition, { timeout: 30000, polling: 50 }, arg);
    } finally {
      await phone.touchscreen.touchEnd();
    }
  };
  const read = (field) => `+document.querySelector('[data-testid="avatar"]').dataset.${field}`;

  check((await pressed()) === 'Orbital', 'no celular, o campus abre no Orbital (vista geral)');
  check((await joystickBox()) === null, 'no Orbital não há joystick');
  for (const b of await phone.$$('button[aria-keyshortcuts="C"]')) if ((await b.evaluate((x) => x.textContent)) === 'Avatar') await b.tap();
  await sleep(600);
  check((await pressed()) === 'Avatar', 'tocar em Avatar liga o modo Avatar');
  const box = await joystickBox();
  const scene = await (await phone.$('.scene')).boundingBox();
  check(
    !!box && box.x - scene.x < 40 && scene.y + scene.height - (box.y + box.height) < 40,
    'o joystick aparece no canto inferior esquerdo da cena',
    box ? `${Math.round(box.width)}×${Math.round(box.height)} px` : 'ausente',
  );

  // 2. Para cima anda; soltar para.
  const start = await avatar();
  await holdUntil([0, -PULL], new Function('z', `return ${read('z')} <= z`), start.z - 2);
  const walked = await avatar();
  check(walked.z <= start.z - 2 && Math.abs(walked.h - start.h) < 0.01, 'Gherkin: arrastar o joystick para cima anda para a frente, sem girar', `z ${start.z.toFixed(1)} ➔ ${walked.z.toFixed(2)}`);
  await sleep(300);
  const released = await avatar();
  await sleep(700);
  check((await avatar()).z === released.z, 'Gherkin: ao soltar o joystick o avatar para', `z ${released.z.toFixed(2)}`);

  // 3. Até a Biblioteca: aviso, Entrar, joystick some e avatar parado.
  await holdUntil([0, -PULL], () => !!document.querySelector('[data-testid="interaction-prompt"]'));
  await sleep(300);
  const prompt = await phone.$('[data-testid="interaction-prompt"]');
  const promptText = await prompt?.evaluate((el) => el.textContent);
  check(promptText?.includes('Biblioteca'), 'andando pelo toque até a Biblioteca, aparece o aviso', promptText);
  const promptBox = await prompt?.boundingBox();
  check(!!promptBox && !overlap(promptBox, await joystickBox()), 'o aviso (no alto da cena) não cobre o joystick');
  for (const b of await phone.$$('[data-testid="interaction-prompt"] button')) if ((await b.evaluate((x) => x.textContent)).includes('Entrar')) await b.tap();
  await sleep(300);
  const dialogTitle = () => phone.$eval('[role="dialog"]', (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent).catch(() => null);
  check((await dialogTitle()) === 'Sala: Biblioteca', 'tocar em Entrar abre a sala');
  check((await joystickBox()) === null, 'com a sala aberta, o joystick some');
  const frozen = await avatar();
  await sleep(700);
  check((await avatar()).z === frozen.z, 'com a sala aberta, o avatar fica parado');
  await phone.keyboard.press('Escape');
  await sleep(300);
  check((await dialogTitle()) === null && (await joystickBox()) !== null, 'fechando a sala, o joystick volta');

  // 4. Esquerda e direita giram para o mesmo lado.
  const h0 = (await avatar()).h;
  await holdUntil([-PULL, 0], new Function('h', `return ${read('heading')} >= h`), h0 + 0.5);
  const h1 = (await avatar()).h;
  await sleep(300);
  check(h1 >= h0 + 0.5, 'Gherkin: arrastar para a esquerda gira para a esquerda', `${h0.toFixed(2)} ➔ ${h1.toFixed(2)} rad`);
  const h2 = (await avatar()).h;
  await holdUntil([PULL, 0], new Function('h', `return ${read('heading')} <= h`), h2 - 0.5);
  check((await avatar()).h <= h2 - 0.5, 'Gherkin: arrastar para a direita gira para a direita');
  check((await phone.evaluate(() => window.scrollY)) === 0, 'arrastar o joystick não rola a página');

  // ---------- Computador (mouse e teclado) ----------
  const desk = await browser.newPage();
  watch(desk);
  await desk.setViewport({ width: 1100, height: 900 });
  await desk.goto(URL_);
  await desk.waitForSelector('canvas', { timeout: 30000 });
  await sleep(800);
  check(await desk.$eval('[aria-pressed="true"][aria-keyshortcuts="C"]', (el) => el.textContent === 'Avatar'), 'com mouse e teclado, o campus abre no Avatar');
  check((await desk.$('[data-testid="joystick"]')) === null, 'Gherkin: com mouse e teclado o joystick não aparece');
  const z0 = await desk.$eval('[data-testid="avatar"]', (el) => +el.dataset.z);
  await desk.keyboard.down('KeyW');
  await desk.waitForFunction((z) => +document.querySelector('[data-testid="avatar"]').dataset.z <= z - 1, { timeout: 30000, polling: 50 }, z0);
  await desk.keyboard.up('KeyW');
  check(true, 'o W continua andando (teclado e joystick somam, sem um anular o outro)');

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
