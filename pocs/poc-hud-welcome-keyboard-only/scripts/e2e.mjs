// Prova no Chrome headless (WebGL por software), com o build de verdade e SÓ COM O TECLADO no computador (nenhum
// clique), os cenários da US78:
//   1. a boas-vindas abre na primeira visita, com o foco no "Começar"; Esc fecha, e ela não volta depois de recarregar;
//   2. H abre a ajuda com as teclas da lista única (M, C, T, H, I, E);
//   3. T abre o chat com o foco no campo; "t c m h" viram texto, Enter envia; Esc e C abrem o Co-Pilot, que responde;
//   4. M troca para a visão Orbital (a câmera sobe de verdade, lida do three.js) e a dica cita o M; M volta ao Avatar;
//   5. andando com WASD até o Portal, E entra e I mostra as informações do prédio;
//   6. num celular emulado (toque): a boas-vindas sem teclas, o "Começar" e o Chat por toque, sem passar da largura.
// E nenhum erro nem requisição externa.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4197;
const URL_ = `http://localhost:${PORT}/`;
/** Pasta para as capturas de tela (só com E2E_SHOTS=1; servem para conferir o 3D a olho). */
const SHOTS = process.env.E2E_SHOTS ? '.e2e-shots' : null;

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
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const foreign = new Set();
  const watch = async (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host === `localhost:${PORT}` || url.protocol === 'data:' || url.protocol === 'blob:') return r.continue();
      foreign.add(url.host);
      return r.abort();
    });
  };
  const text = (page, sel) => page.$eval(sel, (el) => el.textContent);
  const ready = async (page) => {
    await page.waitForSelector('[data-testid="campus-canvas"] canvas', { timeout: 30000 });
    await page.waitForFunction(() => (window.__frames ?? 0) > 10, { timeout: 30000 });
    await page.$eval('[data-testid="scene"]', (el) => el.scrollIntoView({ block: 'center' }));
  };
  /** Vira o avatar para o ponto (x, z) do chão, segurando A ou D, e anda (W) até o prédio entrar no alcance. */
  const walkTo = async (page, x, z, label) => {
    const diff = () =>
      page.evaluate(
        (tx, tz) => {
          const a = window.__avatar;
          const d = Math.atan2(tx - a.x, tz - a.z) - a.heading;
          return Math.atan2(Math.sin(d), Math.cos(d));
        },
        x,
        z,
      );
    const d0 = await diff();
    if (Math.abs(d0) > 0.04) {
      const k = d0 > 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(k);
      try {
        await page.waitForFunction(
          (tx, tz, sign) => {
            const a = window.__avatar;
            const d = Math.atan2(tx - a.x, tz - a.z) - a.heading;
            return Math.sign(Math.atan2(Math.sin(d), Math.cos(d))) !== sign || Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.04;
          },
          { timeout: 15000, polling: 'raf' },
          x,
          z,
          Math.sign(d0),
        );
      } finally {
        await page.keyboard.up(k);
      }
    }
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction((l) => document.querySelector('[data-testid="nearby"]')?.textContent.startsWith(l), { timeout: 30000, polling: 50 }, label);
    } finally {
      await page.keyboard.up('KeyW');
    }
    await sleep(300);
  };

    // ---------------------------------------------------------------- computador (só teclado)
  const page = await browser.newPage();
  await watch(page);
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await ready(page);
  const active = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName);
  const open = (id) => page.waitForSelector(`[data-testid="${id}"]`, { timeout: 5000 });
  const closed = (id) => page.waitForFunction((i) => !document.querySelector(`[data-testid="${i}"]`), { timeout: 5000 }, id);

  // 1. Boas-vindas.
  await open('welcome');
  const w = await page.$$eval('[data-testid="welcome"] [data-shortcut]', (els) => els.map((e) => e.dataset.shortcut).join(','));
  const startFocus = await active();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-boas-vindas.png` });
  await page.keyboard.press('Escape');
  await closed('welcome');
  await page.reload();
  await ready(page);
  await sleep(500);
  const again = await page.$('[data-testid="welcome"]');
  check(w.includes('move') && w.includes('mode') && w.includes('help') && startFocus === 'welcome-start' && !again, 'Gherkin: a boas-vindas abre na 1ª visita (foco no Começar), Esc fecha e ela não volta ao recarregar', w);

  // 2. H.
  await page.keyboard.press('KeyH');
  await open('help');
  const keys = await page.$$eval('[data-testid="help"] kbd', (els) => els.map((e) => e.textContent).join(''));
  check(['M', 'C', 'T', 'H', 'I', 'E'].every((k) => keys.includes(k)), 'H abre a ajuda com M, C, T, H, I e E', keys);
  await page.keyboard.press('Escape');
  await closed('help');

  // 3. Chat e Co-Pilot.
  await page.keyboard.press('KeyT');
  await open('chat');
  const chatFocus = await active();
  await page.keyboard.type('t c m h');
  await page.keyboard.press('Enter');
  const log = await text(page, '[data-testid="chat-log"]');
  const noOther = !(await page.$('[data-testid="copilot"]')) && !(await page.$('[data-testid="help"]'));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-chat.png` });
  check(chatFocus === 'chat-input' && log.includes('Você: t c m h') && noOther, 'Gherkin: T abre o chat com o foco no campo; "t c m h" viram texto e Enter envia', log.slice(-40));
  await page.keyboard.press('Escape');
  await closed('chat');
  await page.keyboard.press('KeyC');
  await open('copilot');
  const coFocus = await active();
  await page.keyboard.type('como troco o modo?');
  await page.keyboard.press('Enter');
  const answer = await text(page, '[data-testid="copilot-answer"]');
  check(coFocus === 'copilot-input' && answer.includes('Aperte M'), 'Gherkin: Esc e depois C abrem o Co-Pilot com o foco na pergunta, e ele responde', answer);
  await page.keyboard.press('Escape');
  await closed('copilot');

  // 4. M.
  await sleep(400);
  const yAvatar = await page.evaluate(() => window.__cameraY);
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => (window.__cameraY ?? 0) > 15, { timeout: 5000, polling: 50 }).catch(() => {});
  const yOrbital = await page.evaluate(() => window.__cameraY);
  const hintO = await text(page, '[data-testid="mode-hint"]');
  const pressed = await page.$eval('[data-testid="mode-orbital"]', (e) => e.getAttribute('aria-pressed'));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-orbital.png` });
  check(yOrbital > yAvatar + 5 && pressed === 'true' && hintO.includes('M alterna'), 'Gherkin: M passa para a visão Orbital (a câmera sobe) e a dica cita "M alterna"', `câmera ${yAvatar?.toFixed(1)} → ${yOrbital?.toFixed(1)}`);
  await page.keyboard.press('KeyM');
  await page.waitForFunction((y) => (window.__cameraY ?? 99) < y + 2, { timeout: 8000, polling: 50 }, yAvatar).catch(() => {});
  const back = await page.$eval('[data-testid="mode-avatar"]', (e) => e.getAttribute('aria-pressed'));
  check(back === 'true', 'M de novo volta ao Avatar');

  // 5. Andar até o Portal, E e I.
  await walkTo(page, 0, -9, 'Prédio no alcance: Portal');
  await page.keyboard.press('KeyE');
  const said = await text(page, '[data-testid="game-said"]');
  await page.keyboard.press('KeyI');
  await open('info');
  const info = await text(page, '[data-testid="info"]');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-portal.png` });
  check(said.includes('Portal dos cursos') && info.includes('Portal dos cursos:'), 'andando com WASD até o Portal, E entra e I mostra as informações dele', said);
  await page.keyboard.press('Escape');
  await page.close();

  // ---------------------------------------------------------------- celular
  // Contexto anônimo, como um aparelho novo: a boas-vindas abre de novo.
  const phone = await (await browser.createBrowserContext()).newPage();
  await watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await ready(phone);
  await phone.waitForSelector('[data-testid="welcome"]');
  const touchGuide = await phone.$eval('[data-testid="welcome"]', (e) => ({ kbd: e.querySelectorAll('kbd:not(.modal-close kbd)').length, touch: !!e.querySelector('.guide-touch') }));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/5-celular.png` });
  await (await phone.$('[data-testid="welcome-start"]')).tap();
  await phone.waitForSelector('[data-testid="joystick"]', { timeout: 15000 });
  await (await phone.$('[data-hud-action="chat"]')).tap();
  await phone.waitForSelector('[data-testid="chat"]');
  const fits = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth, vw: innerWidth }));
  check(touchGuide.touch && touchGuide.kbd === 0 && fits.scroll <= fits.vw, 'no celular, a boas-vindas fala do toque (sem teclas), Começar e Chat funcionam por toque e nada passa da largura', `${fits.scroll}px de ${fits.vw}px`);
  await phone.close();

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
