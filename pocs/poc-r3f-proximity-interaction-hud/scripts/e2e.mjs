// Prova com teclas reais no Chrome headless (WebGL por software):
//   1. longe dos prédios não há aviso; andando até a Biblioteca, o aviso traduzido aparece dentro do raio (3 m);
//   2. I abre as informações, E a sala com as missões, H o guia; Esc fecha; com a janela aberta o avatar não anda;
//   3. digitar "h", "i" e "e" no campo de anotações não abre nada;
//   4. voltando para longe, o aviso some; nenhum erro e nenhuma requisição a outra origem.
import { existsSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4186;
const URL_ = `http://localhost:${PORT}/`;
const WALL_Z = 2; // face sul da Biblioteca
const RADIUS = 3; // raio padrão de interação, a partir da parede
const PROMPT = 'Pressione [E] para Entrar ou [I] para Informações';

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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const z = () => page.$eval('[data-testid="avatar"]', (el) => +el.dataset.z);
  const prompt = () => page.$eval('[data-testid="interaction-prompt"]', (el) => el.textContent).catch(() => null);
  const dialog = () => page.$eval('[role="dialog"]', (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent).catch(() => null);
  const holdUntil = async (key, fn, arg) => {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(fn, { timeout: 30000, polling: 50 }, arg);
    } finally {
      await page.keyboard.up(key);
    }
  };

  // 1. Longe: sem aviso. W até o aviso aparecer: tem que ser dentro do raio.
  check((await prompt()) === null, 'no ponto de partida (longe dos prédios) não há aviso');
  await holdUntil('KeyW', () => !!document.querySelector('[data-testid="interaction-prompt"]'));
  await sleep(250); // o painel de posição atualiza a cada 100 ms
  const zAtPrompt = await z();
  check(zAtPrompt - WALL_Z <= RADIUS + 0.35, 'o aviso aparece ao entrar no raio de 3 m da Biblioteca', `a ${(zAtPrompt - WALL_Z).toFixed(2)} m da parede`);
  check((await prompt())?.includes(PROMPT), 'aviso traduzido com o nome do prédio', await prompt());

  // 2. I, E e H; Esc fecha; com janela aberta o avatar não anda.
  await page.keyboard.press('KeyI');
  check((await dialog()) === 'Sobre: Biblioteca', 'I abre as informações do prédio');
  check(await page.$eval('[role="dialog"]', (el) => el.getAttribute('aria-modal') === 'true' && el.contains(document.activeElement)), 'janela com aria-modal e o foco dentro dela');
  const before = await z();
  await page.keyboard.down('KeyW');
  await sleep(700);
  await page.keyboard.up('KeyW');
  check((await z()) === before, 'com a janela aberta, o avatar não anda');
  await page.keyboard.press('Escape');
  check((await dialog()) === null, 'Esc fecha a janela');

  await page.keyboard.press('KeyE');
  const quests = await page.$$eval('[data-testid="room-panel"] li', (lis) => lis.length).catch(() => 0);
  check((await dialog()) === 'Sala: Biblioteca' && quests === 2, 'E entra na sala e mostra as missões', `${quests} missões`);
  await page.keyboard.press('Escape');

  await page.keyboard.press('KeyH');
  check((await dialog()) === 'Guia do Aluno & Controles do Campus', 'H abre o guia do aluno');
  check(await page.$eval('[role="dialog"] .guide', (el) => !!el.querySelector('table') && el.textContent.includes('Como andar')), 'o guia em Markdown aparece formatado (títulos e tabela)');
  await page.keyboard.press('Escape');

  // 3. Digitar no campo não dispara atalhos.
  await page.click('[data-testid="notes"]');
  await page.keyboard.type('hie HIE');
  check((await dialog()) === null, 'digitar h, i, e no campo de anotações não abre nenhuma janela');
  check((await page.$eval('[data-testid="notes"]', (el) => el.value)) === 'hie HIE', 'o texto digitado chega ao campo');
  await page.$eval('[data-testid="notes"]', (el) => el.blur());

  // 4. S até sair do raio: o aviso some.
  await holdUntil('KeyS', () => !document.querySelector('[data-testid="interaction-prompt"]'));
  await sleep(250); // o painel de posição atualiza a cada 100 ms
  check((await z()) - WALL_Z > RADIUS - 0.35, 'ao se afastar, o aviso some', `a ${((await z()) - WALL_Z).toFixed(2)} m da parede`);

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
