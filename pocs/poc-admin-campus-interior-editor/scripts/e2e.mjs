// Prova no Chrome headless, com o build de verdade:
//   1. no computador, nada passa da largura da tela, e o pedaço do 3D não é baixado na abertura;
//   2. só com o teclado: o foco num prédio da planta, as setas o movem na grade e o painel acompanha;
//   3. com o mouse: arrastar um prédio na planta o move (e cria o rascunho);
//   4. o interior: acrescentar duas estações e publicar (versão 2); uma estação sobre a porta não publica;
//   5. a pré-visualização 3D: o pedaço do 3D só é baixado ao abrir, e o canvas WebGL aparece na janela;
//   6. no celular (390 px): a lista de documentos vira gaveta, a planta cabe na tela e não há rolagem horizontal;
//   7. o tema claro troca as cores; e nenhum erro nem requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4193;
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
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const foreign = new Set();
  const loaded = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host && url.host !== `localhost:${PORT}`) foreign.add(url.host);
      loaded.push(url.pathname);
    });
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const visible = (page, sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== 'hidden';
    }, sel);
  const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? '');
  const label = (page, id) => page.$eval(`[data-item="${id}"]`, (el) => el.getAttribute('aria-label') ?? '');
  // Os itens da planta são <g> de SVG com tabIndex: o focus() do Puppeteer só aceita HTMLElement.
  const focusItem = (page, id) => page.$eval(`[data-item="${id}"]`, (el) => el.focus());
  const clickText = (page, sel, txt) => page.evaluate((s, t) => [...document.querySelectorAll(s)].find((b) => b.textContent?.trim().startsWith(t))?.click(), sel, txt);

  // ---------- Computador ----------
  const desk = await browser.newPage();
  watch(desk);
  await desk.setViewport({ width: 1280, height: 860 });
  await desk.goto(URL_);
  await desk.waitForSelector('svg.plan');
  check((await text(desk, 'h1')) === 'Sede', 'abre na sede da instituição');
  check((await overflow(desk)) <= 0, 'computador: nada passa da largura da tela');
  check(!loaded.some((p) => /Preview3D-/.test(p)), 'o pedaço do 3D não é baixado na abertura');

  // Teclado: o foco chega num prédio e as setas o movem meio metro (Shift: 2 m).
  await focusItem(desk, 'matriculas');
  await desk.keyboard.press('ArrowRight');
  await desk.keyboard.press('ArrowRight');
  await desk.keyboard.down('Shift');
  await desk.keyboard.press('ArrowDown');
  await desk.keyboard.up('Shift');
  check((await label(desk, 'matriculas')).includes('em x -7 e z -4'), 'teclado: as setas movem o prédio na grade', await label(desk, 'matriculas'));
  check((await desk.$eval('.side input[type="number"]', (el) => el.value)) === '-7', 'o painel mostra a posição nova');
  check((await text(desk, '[data-testid="doc-status"]')).includes('rascunho'), 'a edição cria o rascunho');

  // Mouse: arrastar o Portal dos cursos.
  const box = await (await desk.$('[data-item="portal"] rect')).boundingBox();
  const before = await label(desk, 'portal');
  await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desk.mouse.down();
  await desk.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 });
  await desk.mouse.up();
  check((await label(desk, 'portal')) !== before, 'mouse: arrastar move o prédio', `${before} ➔ ${await label(desk, 'portal')}`);
  await clickText(desk, '.toolbar .button', 'Descartar rascunho');
  await sleep(100);

  // O interior da Biblioteca: duas estações e publicar.
  await clickText(desk, '.nav-item', 'Inglês Básico · Fase 1');
  await desk.waitForSelector('[data-item="biblioteca"]');
  await focusItem(desk, 'biblioteca');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('[data-item="quadro-1"]');
  await clickText(desk, '.side .button', 'Acrescentar estação');
  await clickText(desk, '.crumbs .link', 'Cidade');
  await focusItem(desk, 'biblioteca');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('[data-item="estacao-1"]');
  await clickText(desk, '.side .button', 'Acrescentar estação');
  check((await desk.$$('.plan .station')).length === 2, 'o interior ganha duas estações');
  await clickText(desk, '.toolbar .button', 'Publicar');
  await sleep(100);
  check((await text(desk, '[data-testid="notice"]')).includes('versão 2'), 'publicar cria a versão 2 (aviso falado)');

  // Uma estação sobre a porta não publica.
  await clickText(desk, '.side .button', 'Acrescentar estação');
  const [x, z] = await desk.$$('.side input[type="number"]');
  await x.click({ clickCount: 3 });
  await x.type('0');
  await z.click({ clickCount: 3 });
  await z.type('5');
  await sleep(100);
  check((await text(desk, '.problems')).includes('bloqueia a porta'), 'a estação sobre a porta aparece nos problemas');
  await clickText(desk, '.toolbar .button', 'Publicar');
  await sleep(100);
  check((await text(desk, '[data-testid="notice"]')).includes('Não publicado') && (await text(desk, '[data-testid="doc-status"]')).includes('versão 2'), 'com problema, não publica');

  // Pré-visualização 3D: o pedaço só vem agora, e o canvas aparece.
  await clickText(desk, '.toolbar .button', 'Pré-visualizar em 3D');
  await desk.waitForSelector('[data-testid="preview"] canvas', { timeout: 30000 });
  check(loaded.some((p) => /Preview3D-/.test(p)), 'abrir a pré-visualização baixa o pedaço do 3D');
  // O canvas ocupa a caixa da pré-visualização (o padrão do navegador, 300×150, seria sinal de que ele não se ajustou).
  await desk.waitForFunction(() => (document.querySelector('[data-testid="preview"] canvas')?.clientWidth ?? 0) > 300, { timeout: 10000 }).catch(() => undefined);
  const size = await desk.$eval('[data-testid="preview"] canvas', (c) => ({ w: c.clientWidth, h: c.clientHeight, box: c.closest('.preview').clientWidth }));
  check(size.w > 300 && size.w === size.box, 'o canvas WebGL ocupa a janela da pré-visualização', `${size.w}×${size.h}`);
  await desk.keyboard.press('Escape');
  await sleep(200);

  // Tema claro.
  const darkBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await desk.click('.button.theme');
  const lightBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(darkBg !== lightBg, 'o tema claro troca as cores', `${darkBg} ➔ ${lightBg}`);

  // ---------- Celular ----------
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('svg.plan');
  check(!(await visible(phone, '.sidebar')), 'celular: a lista de documentos começa fechada');
  check((await overflow(phone)) <= 0, 'celular: sem rolagem horizontal');
  const planWidth = await phone.$eval('svg.plan', (el) => el.getBoundingClientRect().width);
  check(planWidth <= 390 && planWidth > 250, 'celular: a planta cabe na tela', `${Math.round(planWidth)} px`);
  await phone.tap('.menu');
  await sleep(300);
  check(await visible(phone, '.sidebar'), 'celular: o botão do menu abre a gaveta');
  await phone.keyboard.press('Escape');
  await sleep(300);
  check(!(await visible(phone, '.sidebar')), 'celular: Esc fecha a gaveta');

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem', [...foreign].join(', '));
} finally {
  await browser?.close();
  await server.close();
  rmSync(OUT, { recursive: true, force: true });
}

if (failed) {
  console.error('\ne2e: FALHOU');
  process.exit(1);
}
console.log('\ne2e: tudo certo');
