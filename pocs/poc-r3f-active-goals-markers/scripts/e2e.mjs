// Prova com teclas e toques reais no Chrome headless (WebGL por software) os cenários da US55, com o build de verdade:
//   1. G abre as metas, a tecla 1 fixa "Base técnica": o HUD mostra 0 de 2 e a CENA desenha os marcadores nos 2 prédios;
//   2. andando até a Oficina, E conclui a missão: 1 de 2, e o marcador da Oficina some;
//   3. andando até o Laboratório, E conclui a segunda: a meta aparece cumprida, e nenhum marcador fica na cena;
//   4. os marcadores desligam e religam nas opções; a meta fixada continua fixada depois de recarregar;
//   5. na fase sem metas do autor, o HUD sugere a próxima missão, e o prédio dela ganha o marcador;
//   6. num celular emulado (toque): Metas, tocar na meta, o marcador na cena, e nada passa da largura da tela.
// Os marcadores são lidos do grafo do three.js (window.__markers), não do HUD. E nenhum erro nem requisição externa.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4195;
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
  /** Os marcadores desenhados na cena, em ordem alfabética (espera a cena publicar a mudança). */
  const markers = async (page, expected) => {
    const want = [...expected].sort().join(',');
    await page.waitForFunction((w) => [...(window.__markers ?? [])].sort().join(',') === w, { timeout: 5000, polling: 50 }, want).catch(() => {});
    return page.evaluate(() => [...(window.__markers ?? [])].sort().join(','));
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

  // ---------------------------------------------------------------- computador
  const page = await browser.newPage();
  await watch(page);
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await ready(page);
  check((await markers(page, [])) === '', 'sem meta fixada, nenhum marcador na cena');

  // 1. G e a tecla 1.
  await page.keyboard.press('KeyG');
  await page.waitForSelector('[data-testid="goals-panel"] [role="listbox"]');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  await page.keyboard.press('Digit1');
  const said = await text(page, '[data-testid="pin-said"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid="goals-panel"]'));
  const p1 = await text(page, '[data-testid="progress-base-tecnica"]');
  const m1 = await markers(page, ['oficina', 'dados']);
  check(focused === 'listbox' && said.includes('Base técnica fixada') && p1 === '0 de 2' && m1 === 'dados,oficina', 'Gherkin: fixar "Base técnica" (G e 1) mostra 0 de 2 e desenha os marcadores nos dois prédios', `${p1}; marcadores: ${m1}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-meta-fixada.png` });

  // 2. A Oficina.
  await walkTo(page, -8, -4, 'Oficina');
  await page.keyboard.press('KeyE');
  const p2 = await text(page, '[data-testid="progress-base-tecnica"]');
  const m2 = await markers(page, ['dados']);
  check(p2 === '1 de 2' && m2 === 'dados', 'perto da Oficina, E conclui a missão: 1 de 2, e o marcador dela some', `${p2}; marcadores: ${m2}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-oficina.png` });

  // 3. O Laboratório.
  await walkTo(page, 8, -4, 'Laboratório');
  await page.keyboard.press('KeyE');
  const p3 = await text(page, '[data-testid="progress-base-tecnica"]');
  const m3 = await markers(page, []);
  check(p3.includes('cumprida') && m3 === '', 'Gherkin: concluída a segunda missão, a meta aparece cumprida e os marcadores somem da cena', `${p3}; marcadores: "${m3}"`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-cumprida.png` });

  // 4. Desligar e religar; recarregar.
  await page.keyboard.press('KeyG');
  await page.waitForSelector('[data-testid="goals-panel"] [role="listbox"]');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Escape');
  const on = await markers(page, ['produto', 'dados']);
  await page.click('[data-testid="markers-toggle"]');
  const off = await markers(page, []);
  await page.click('[data-testid="markers-toggle"]');
  const back = await markers(page, ['produto', 'dados']);
  check(on === 'dados,produto' && off === '' && back === on, 'os marcadores desligam e religam nas opções', `${on} → "${off}" → ${back}`);
  await page.reload();
  await ready(page);
  const pinnedAfter = await page.$$eval('[data-testid="goals-hud"] [data-goal]', (els) => els.map((e) => e.dataset.goal).join(','));
  check(pinnedAfter === 'base-tecnica,visao-produto', 'as metas fixadas ficam no aparelho: continuam depois de recarregar', pinnedAfter);

  // 5. A fase sem metas.
  await page.click('[data-phase="fase-2"]');
  const suggestion = await text(page, '[data-testid="suggestion"]');
  const m5 = await markers(page, ['produto']);
  check(suggestion.includes('Refinar as histórias da sprint') && m5 === 'produto', 'Gherkin: na fase sem metas do autor, o HUD sugere a próxima missão, e o prédio dela ganha o marcador', suggestion);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-sem-metas.png` });
  await page.close();

  // ---------------------------------------------------------------- celular
  // Contexto anônimo, como um aparelho novo: o armazenamento do computador (as metas fixadas) não vem junto.
  const phone = await (await browser.createBrowserContext()).newPage();
  await watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await ready(phone);
  await phone.waitForSelector('[data-testid="joystick"]', { timeout: 15000 });
  await (await phone.$('[data-testid="open-goals"]')).tap();
  await phone.waitForSelector('[data-testid="goals-panel"] [data-item="visao-produto"]');
  await (await phone.$('[data-testid="goals-panel"] [data-item="visao-produto"]')).tap();
  await (await phone.$('[data-testid="goals-panel"] .modal-close')).tap();
  await phone.waitForFunction(() => !document.querySelector('[data-testid="goals-panel"]'));
  const mp = await markers(phone, ['produto', 'dados']);
  const fits = await phone.evaluate(() => {
    const hud = document.querySelector('[data-testid="goals-hud"]').getBoundingClientRect();
    const joy = document.querySelector('[data-testid="joystick"]').getBoundingClientRect();
    const overlap = !(hud.bottom <= joy.top || hud.top >= joy.bottom || hud.right <= joy.left || hud.left >= joy.right);
    return { scroll: document.documentElement.scrollWidth, vw: innerWidth, overlap };
  });
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/5-celular.png` });
  check(mp === 'dados,produto' && fits.scroll <= fits.vw && !fits.overlap, 'no celular, tocar em Metas e na meta desenha os marcadores; o painel não cobre o joystick e nada passa da largura', `${mp}; ${fits.scroll}px de ${fits.vw}px`);
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
