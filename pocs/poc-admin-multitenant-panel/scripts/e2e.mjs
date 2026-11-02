// Prova no Chrome headless, com o build de verdade:
//   1. no computador, a navegação lateral fica à vista e nada passa da largura da tela;
//   2. só com o teclado: o link "Pular para o conteúdo", criar uma instituição e desativar com confirmação;
//   3. no celular (390 px): a navegação vira gaveta (o botão abre e fecha), cada linha da tabela vira um cartão e não
//      há rolagem horizontal;
//   4. o tema claro troca as cores e o "Ver como: Aluno" mostra "Acesso recusado";
//   e nenhum erro nem requisição a outra origem.
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
  const errors = [];
  const foreign = new Set();
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const host = new URL(r.url()).host;
      if (host && host !== `localhost:${PORT}`) foreign.add(host);
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

  // ---------- Computador ----------
  const desk = await browser.newPage();
  watch(desk);
  await desk.setViewport({ width: 1280, height: 800 });
  await desk.goto(URL_);
  await desk.waitForSelector('table');
  check(await visible(desk, '.sidebar'), 'computador: a navegação lateral fica à vista');
  check((await overflow(desk)) <= 0, 'computador: nada passa da largura da tela');
  check((await text(desk, 'h1')) === 'Instituições', 'abre em Instituições para o master da plataforma');

  // Só teclado: o primeiro Tab chega no "Pular para o conteúdo".
  await desk.keyboard.press('Tab');
  check((await desk.evaluate(() => document.activeElement?.textContent)) === 'Pular para o conteúdo', 'teclado: o primeiro Tab é o "Pular para o conteúdo"');
  await desk.keyboard.press('Enter');
  check((await desk.evaluate(() => document.activeElement?.id)) === 'conteudo', 'teclado: Enter leva o foco ao conteúdo');

  // Criar uma instituição só com o teclado.
  await desk.focus('.page-actions .button');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('[role="dialog"]');
  check((await desk.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Fechar', 'a janela abre com o foco dentro dela');
  await desk.keyboard.press('Tab');
  await desk.keyboard.type('Escola Litoral');
  await desk.keyboard.press('Tab');
  check((await desk.evaluate(() => document.activeElement?.value)) === 'escola-litoral', 'o endereço é sugerido pelo nome');
  await desk.keyboard.press('Tab');
  await desk.keyboard.type('rita@litoral.test');
  await desk.keyboard.press('Enter');
  await desk.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  check((await text(desk, '[data-testid="notice"]')).includes('Escola Litoral criada'), 'Enter no formulário cria a instituição e o aviso é falado (aria-live)');

  // Desativar pede confirmação, com o foco em Cancelar; Esc fecha e o foco volta.
  await desk.type('input[type="search"]', 'litoral');
  await desk.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await desk.focus('tbody .button.danger-ghost');
  await desk.keyboard.press('Enter');
  await desk.waitForSelector('[role="alertdialog"]');
  check((await desk.evaluate(() => document.activeElement?.textContent)) === 'Cancelar', 'a confirmação começa no Cancelar');
  await desk.keyboard.press('Escape');
  await sleep(100);
  check((await desk.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Desativar: Escola Litoral', 'Esc fecha e o foco volta ao botão');

  // Tema claro e aluno.
  const darkBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await desk.click('.button.theme');
  const lightBg = await desk.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(darkBg !== lightBg && (await desk.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'o tema claro troca as cores', `${darkBg} ➔ ${lightBg}`);
  await desk.select('select', 'aurora-student');
  await desk.waitForSelector('[role="alert"]');
  check((await text(desk, '[role="alert"] h1')) === 'Acesso recusado' && !(await desk.$('nav')), 'Ver como: Aluno mostra "Acesso recusado", sem navegação');

  // ---------- Celular ----------
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('table');
  check(!(await visible(phone, '.sidebar')), 'celular: a navegação começa fechada');
  check((await overflow(phone)) <= 0, 'celular: sem rolagem horizontal');
  check((await phone.$eval('thead', (el) => el.getBoundingClientRect().height)) <= 1, 'celular: o cabeçalho da tabela some e cada linha vira um cartão');
  check((await phone.$eval('tbody td', (el) => getComputedStyle(el, '::before').content)) === '"Nome"', 'celular: cada campo do cartão leva o rótulo da coluna');
  await phone.tap('.menu');
  await sleep(300);
  check((await visible(phone, '.sidebar')) && (await phone.$eval('.menu', (b) => b.getAttribute('aria-expanded'))) === 'true', 'celular: o botão do menu abre a gaveta (aria-expanded)');
  await phone.keyboard.press('Escape');
  await sleep(300);
  check(!(await visible(phone, '.sidebar')), 'celular: Esc fecha a gaveta');
  await phone.tap('.menu');
  await sleep(300);
  await phone.evaluate(() => [...document.querySelectorAll('.nav-item')].find((b) => b.textContent === 'Pessoas')?.click());
  await sleep(300);
  check(!(await visible(phone, '.sidebar')) && (await text(phone, 'h1')) === 'Pessoas', 'celular: escolher a seção fecha a gaveta');
  check((await overflow(phone)) <= 0, 'celular: a tabela de pessoas também cabe na tela');

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
