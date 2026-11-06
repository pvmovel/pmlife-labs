// Prova no Chrome headless, com o build de verdade:
//   1. no computador, nada passa da largura da tela, e a instituição começa sem cursos;
//   2. criar o primeiro curso só com o teclado (Tab, digitar e Enter) abre o editor, sem nenhum problema;
//   3. as abas pelas setas; a fase 2 com uma missão; publicar (versão 1); a visão do aluno com a fase 2 depois da 1;
//   4. um XP zerado aparece nos problemas, não publica, e o problema leva ao campo (com o foco);
//   5. o autor não vê o "Novo curso";
//   6. no celular (390 px): a gaveta, os cartões e nenhuma rolagem horizontal;
//   7. o tema claro troca as cores; e nenhum erro nem requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

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
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host && url.host !== `localhost:${PORT}`) foreign.add(url.host);
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
  const clickText = (page, sel, txt) => page.evaluate((s, t) => [...document.querySelectorAll(s)].find((b) => b.textContent?.trim().startsWith(t))?.click(), sel, txt);
  const activeLabel = (page) => page.evaluate(() => {
    const el = document.activeElement;
    return el?.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent ?? '' : el?.textContent ?? '';
  });
  /** Tab até o campo com o rótulo (no máximo 40 vezes). */
  const tabTo = async (page, label) => {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if ((await activeLabel(page)).trim() === label) return true;
    }
    return false;
  };

  // ---------- Computador ----------
  const desk = await browser.newPage();
  watch(desk);
  await desk.setViewport({ width: 1280, height: 860 });
  await desk.goto(URL_);
  await desk.waitForSelector('h1');
  check((await text(desk, 'main')).includes('ainda não tem cursos'), 'a instituição começa sem cursos');
  check((await overflow(desk)) <= 0, 'computador: nada passa da largura da tela');

  // Criar o primeiro curso só com o teclado.
  const reachedNew = await tabTo(desk, 'Novo curso');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('[role="dialog"]');
  await desk.keyboard.type('ingles-basico');
  await tabTo(desk, 'Título em português');
  await desk.keyboard.type('Inglês Básico');
  await tabTo(desk, 'Título em inglês');
  await desk.keyboard.type('Basic English');
  await desk.keyboard.press('Enter');
  await desk.waitForFunction(() => document.querySelector('h1')?.textContent === 'Inglês Básico');
  check(reachedNew && !(await desk.$('[role="dialog"]')), 'teclado: o "Novo curso" cria o curso e abre o editor');
  check((await text(desk, '[data-testid="status"]')).includes('Rascunho') && (await text(desk, '[data-testid="problems"]')).includes('Nenhum problema'), 'o curso nasce do modelo válido (rascunho, sem problemas)');

  // As abas pelas setas.
  await desk.focus('[role="tab"][aria-selected="true"]');
  await desk.keyboard.press('ArrowRight');
  check((await desk.evaluate(() => document.activeElement?.textContent)) === 'Fases', 'as setas trocam de aba');

  // A fase 2, com uma missão, e publicar.
  await clickText(desk, '.panel > .button', 'Acrescentar fase');
  await sleep(50);
  check((await desk.$$('.panel > .card')).length === 2, 'a fase 2 entra na lista');
  await desk.click('[role="tab"]:nth-child(3)');
  await desk.select('.field.narrow select', '1');
  await clickText(desk, '.panel > .button', 'Acrescentar missão');
  await sleep(50);
  const title = await desk.$('[data-path="/phases/1/quests/0/title"]');
  await title.click({ clickCount: 3 });
  await title.type('Pedir um café');
  await clickText(desk, '.toolbar .button', 'Publicar');
  await sleep(100);
  check((await text(desk, '[data-testid="notice"]')).includes('versão 1'), 'publicar cria a versão 1 (aviso falado)');
  await clickText(desk, '.toolbar .button', 'Visão do aluno');
  await desk.waitForSelector('[data-testid="student"]');
  const order = await desk.$$eval('.student-phases > li > strong', (els) => els.map((e) => e.textContent));
  check(order.join(' > ') === 'Fase 1 > Fase 2', 'a visão do aluno mostra a fase 2 depois da 1', order.join(' > '));
  await clickText(desk, '.toolbar .button', 'Visão do aluno');
  await desk.waitForSelector('[role="tablist"]');

  // XP zerado: aparece, não publica, e o problema leva ao campo.
  await desk.click('[role="tab"]:nth-child(3)');
  await desk.select('.field.narrow select', '0');
  const xp = await desk.$('[data-path="/phases/0/quests/0/xp"]');
  await xp.click({ clickCount: 3 });
  await xp.type('0');
  await sleep(50);
  await desk.click('[role="tab"]:nth-child(1)');
  await clickText(desk, '.toolbar .button', 'Publicar');
  await sleep(100);
  check((await text(desk, '[data-testid="notice"]')).includes('Não publicado') && (await text(desk, '[data-testid="status"]')).includes('versão 1'), 'com problema, não publica');
  await clickText(desk, '.problems .link', 'Missão 1 da fase 1');
  await sleep(100);
  check((await desk.evaluate(() => document.activeElement?.getAttribute('data-path'))) === '/phases/0/quests/0/xp', 'o problema leva ao campo do XP (com o foco)');

  // Tema claro.
  const darkBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await desk.click('.button.theme');
  const lightBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(darkBg !== lightBg, 'o tema claro troca as cores', `${darkBg} ➔ ${lightBg}`);

  // O autor não cria cursos.
  await clickText(desk, '.toolbar .link', '←');
  await desk.select('.controls select', 'author');
  await sleep(50);
  check(!(await desk.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Novo curso'))) && (await text(desk, 'main')).includes('Só o master'), 'o autor não vê o "Novo curso"');

  // ---------- Celular ----------
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('h1');
  check(!(await visible(phone, '.sidebar')), 'celular: o menu começa fechado');
  await phone.tap('.page-actions .button');
  await phone.waitForSelector('[role="dialog"]');
  await phone.type('[role="dialog"] input', 'ingles');
  const [, pt, en] = await phone.$$('[role="dialog"] input');
  await pt.type('Inglês');
  await en.type('English');
  await phone.tap('[role="dialog"] .button.primary');
  await phone.waitForSelector('[role="tablist"]');
  await phone.tap('[role="tab"]:nth-child(3)');
  await sleep(50);
  check((await overflow(phone)) <= 0, 'celular: o editor sem rolagem horizontal');
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
