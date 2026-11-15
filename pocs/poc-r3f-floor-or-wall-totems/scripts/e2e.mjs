// Prova no Chrome headless (WebGL por software), com o build de verdade, os cenários da US75:
//   1. a sala de 18 m abre com os objetos da parede e a placa de aviso do chão, lidos do grafo do three.js;
//   2. o master leva o totem "Aula 1" para o chão, no meio da sala, virado para a porta, e publica: a CENA passa a ter
//      o totem no chão; o avatar anda até ele pelo teclado, e o E abre o vídeo em tela cheia, como na parede;
//   3. o quadro de aviso vai para o chão como placa de aviso;
//   4. o sexto quadro na parede norte é recusado com o aviso, e a cena não muda;
//   5. o totem no corredor da porta é recusado, apontando o totem;
//   6. a sala nova tem paredes de 18 m, e a parede da porta recebe 5 quadros (o sexto, não);
//   7. num celular emulado, o editor e a sala cabem na largura da tela.
// O player do YouTube é trocado por um falso na mesma origem do player (pela interceptação de requisições). E nenhum
// erro na página nem requisição a outra origem além do player.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4198;
const URL_ = `http://localhost:${PORT}/`;
const PLAYER_HOST = 'www.youtube-nocookie.com';
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

/** O player falso: espera o pedido "listening" e responde pronto, ou o erro do vídeo removido (código 100). */
const fakePlayer = (id) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000;color:#fff;font:16px sans-serif;display:grid;place-items:center;height:100vh">
<p>player falso · ${id}</p>
<script>
  addEventListener('message', (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.event !== 'listening') return;
    parent.postMessage(JSON.stringify(${JSON.stringify(id)} === 'zzzzzzzzzz0' ? { event: 'onError', info: 100, id: 1, channel: 'widget' } : { event: 'onReady', id: 1, channel: 'widget' }), '*');
  });
</script></body></html>`;

await build({ logLevel: 'warn', base: '/', build: { outDir: OUT, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const foreign = new Set();
  const playerRequests = [];
  /** `blockPlayer`: simula a rede que bloqueia o YouTube (a requisição do player falha). */
  const watch = async (page, { blockPlayer = false } = {}) => {
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host === `localhost:${PORT}` || url.protocol === 'data:' || url.protocol === 'blob:') return r.continue();
      if (url.host === PLAYER_HOST && url.pathname.startsWith('/embed/')) {
        playerRequests.push(url);
        if (blockPlayer) return r.abort('blockedbyclient');
        return r.respond({ status: 200, contentType: 'text/html', body: fakePlayer(url.pathname.split('/')[2]) });
      }
      foreign.add(url.host);
      return r.abort();
    });
  };
  const overlayStatus = (page) => page.evaluate(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status ?? null);
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
  await page.waitForSelector('[data-testid="room-canvas"] canvas', { timeout: 30000 });
  await page.waitForFunction(() => (window.__frames ?? 0) > 10 && (window.__items ?? []).length > 0, { timeout: 30000 });
  const items = (page) => page.evaluate(() => [...(window.__items ?? [])].sort());
  const sceneHas = (page, want) => page.waitForFunction((w) => (window.__items ?? []).includes(w), { timeout: 8000, polling: 50 }, want).then(() => true).catch(() => false);
  const setField = async (page, testId, value) => {
    await page.$eval(`[data-testid="${testId}"]`, (el, v) => {
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }, value);
  };
  const problemCodes = (page) => page.$$eval('[data-testid="editor-problems"] li', (els) => els.map((e) => `${e.dataset.code}@${e.dataset.item}`));

  // 1. A sala de exemplo.
  const i0 = await items(page);
  check(i0.includes('aula-1:wall') && i0.includes('placa-boas-vindas:floor') && i0.filter((x) => x.endsWith(':wall')).length === 6, 'a sala de 18 m abre com os objetos da parede e a placa de aviso no chão (lidos da cena)', i0.join(', '));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-sala.png` });

  // 2. O totem "Aula 1" no chão, e o E.
  await page.click('[data-testid="place-aula-1-floor"]');
  await page.click('[data-testid="publish"]');
  const onFloor = await sceneHas(page, 'aula-1:floor');
  await page.$eval('[data-testid="scene"]', (el) => el.scrollIntoView({ block: 'center' }));
  await walkTo(page, 0, 0, 'Aula 1');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-totem-no-chao.png` });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status === 'ready', { timeout: 15000 }).catch(() => {});
  const ready = await overlayStatus(page);
  check(onFloor && ready === 'ready', 'Gherkin: o totem "Aula 1" vai para o chão no meio da sala, e perto dele o E abre o vídeo em tela cheia, como na parede', `${ready}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid="video-overlay"]'), { timeout: 5000 });

  // 3. O quadro de aviso como placa no chão.
  await page.click('[data-testid="place-quadro-aviso-floor"]');
  await setField(page, 'x-quadro-aviso', '3');
  await setField(page, 'z-quadro-aviso', '3');
  await page.click('[data-testid="publish"]');
  check(await sceneHas(page, 'quadro-aviso:floor'), 'Gherkin: o quadro de texto vira uma placa de aviso no chão, com o mesmo texto');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-placa.png` });

  // 4. O sexto quadro na parede norte (com o "Aula 1" no chão, a norte tem 4: o primeiro quadro novo cabe, o segundo não).
  await setField(page, 'add-wall', 'north');
  await page.click('[data-testid="add-board"]');
  const fifth = await sceneHas(page, 'quadro-novo-1:wall');
  const before4 = await items(page);
  await page.click('[data-testid="add-board"]');
  const p4 = await problemCodes(page);
  const after4 = await items(page);
  check(fifth && p4.includes('WALL_ITEMS_TOO_MANY@quadro-novo-2') && after4.join() === before4.join(), 'Gherkin: o sexto quadro na parede norte é recusado com o aviso, e nada muda na cena', p4.join(', '));

  // 5. O totem no corredor da porta.
  await page.click('[data-testid="place-aula-2-floor"]');
  await setField(page, 'x-aula-2', '-6.5');
  await setField(page, 'z-aula-2', '7');
  await page.click('[data-testid="publish"]');
  const p5 = await problemCodes(page);
  check(p5.includes('FLOOR_ITEM_BLOCKS_DOOR@aula-2') && (await items(page)).includes('aula-2:wall'), 'Gherkin: o totem no chão na frente da porta é recusado, apontando o totem', p5.join(', '));

  // 6. A sala nova: 5 quadros na parede da porta.
  await page.click('[data-testid="new-room"]');
  await page.waitForFunction(() => (window.__items ?? []).length === 0, { timeout: 8000 }).catch(() => {});
  await setField(page, 'add-wall', 'south');
  for (let k = 0; k < 5; k++) await page.click('[data-testid="add-board"]');
  await page.waitForFunction(() => (window.__items ?? []).length === 5, { timeout: 8000 }).catch(() => {});
  const south = (await items(page)).length;
  await page.click('[data-testid="add-board"]');
  const p6 = await problemCodes(page);
  const status = await page.$eval('[data-testid="wall-counts"]', (el) => el.textContent);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-sala-nova.png` });
  check(south === 5 && p6[0]?.startsWith('WALL_ITEMS_TOO_MANY') && status.includes('sul 5'), 'Gherkin: a sala nova tem paredes de 18 m, e a parede da porta recebe 5 quadros de 2,4 m (o sexto, não)', status);
  await page.close();

  // ---------------------------------------------------------------- celular
  const phone = await (await browser.createBrowserContext()).newPage();
  await watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('[data-testid="room-canvas"] canvas', { timeout: 30000 });
  await phone.waitForSelector('[data-testid="joystick"]', { timeout: 15000 });
  await (await phone.$('[data-testid="place-quadro-aviso-floor"]')).tap();
  await (await phone.$('[data-testid="publish"]')).tap();
  const phoneFloor = await sceneHas(phone, 'quadro-aviso:floor');
  const fits = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth, vw: innerWidth }));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/5-celular.png`, fullPage: true });
  check(phoneFloor && fits.scroll <= fits.vw, 'no celular, o editor funciona pelo toque, e nada passa da largura da tela', `${fits.scroll}px de ${fits.vw}px`);
  await phone.close();

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem além do player', [...foreign].join(', '));
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
  rmSync(OUT, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
