// Prova com teclas, mouse e toque reais no Chrome headless (WebGL por software) os cenários da US38:
//   1. andando até o totem, E abre o vídeo em tela cheia, com só o básico, e a cena para de desenhar;
//   2. Esc fecha e a cena volta a andar, com o avatar no mesmo lugar; o botão Fechar também;
//   3. clicar no totem abre o vídeo dele;
//   4. o master não grava um link que não é do YouTube, e o link com `si=` vira só o ID;
//   5. o vídeo removido mostra o aviso com o link do YouTube; a rede que bloqueia o YouTube também, depois do prazo;
//   6. num celular emulado (toque), o joystick leva ao totem, Assistir abre o vídeo, e nada passa da largura da tela.
// O player do YouTube é trocado por um falso na MESMA origem (youtube-nocookie.com, pela interceptação de requisições),
// que fala o mesmo protocolo de avisos (postMessage do enablejsapi): o teste não depende da rede nem do YouTube.
// E nenhum erro na página nem requisição a outra origem além do player.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4193;
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
  const frames = (page) => page.evaluate(() => window.__frames ?? 0);
  const overlayStatus = (page) => page.evaluate(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status ?? null);
  const nearby = (page) => page.$eval('[data-testid="nearby"]', (el) => el.textContent);
  const holdUntil = async (page, key, fn) => {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(fn, { timeout: 30000, polling: 50 });
    } finally {
      await page.keyboard.up(key);
    }
  };

  // ---------------------------------------------------------------- computador
  const page = await browser.newPage();
  await watch(page);
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('[data-testid="room-canvas"] canvas', { timeout: 30000 });
  await page.waitForFunction(() => (window.__frames ?? 0) > 10, { timeout: 30000 });

  // 1. Até o totem da parede norte e E.
  await holdUntil(page, 'KeyW', () => document.querySelector('[data-testid="nearby"]')?.textContent.includes('Listening'));
  await sleep(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-perto-do-totem.png` });
  await page.keyboard.press('KeyE');
  await page.waitForSelector('[data-testid="video-overlay"]', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status === 'ready', { timeout: 15000 });
  const box = await page.$eval('[data-testid="video-overlay"]', (el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, title: el.querySelector('h2')?.textContent, src: el.querySelector('iframe')?.src };
  });
  const src = new URL(box.src);
  check(
    box.w === box.vw && box.h === box.vh && src.host === PLAYER_HOST && src.pathname === '/embed/aziM2ePu1O8' && !src.searchParams.has('si'),
    'Gherkin: perto do totem, E abre o vídeo em tela cheia, no player youtube-nocookie, e o player avisa que está pronto',
    `${box.w}×${box.h}, ${box.title}`,
  );
  const before = await frames(page);
  await sleep(800);
  const during = await frames(page);
  check(during - before <= 1, 'com o vídeo aberto, a cena 3D para de desenhar', `${during - before} quadros em 0,8 s`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-video-aberto.png` });

  // 2. Esc volta à sala no mesmo lugar, com a cena andando.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid="video-overlay"]'), { timeout: 5000 });
  const after = await frames(page);
  await sleep(500);
  check((await frames(page)) - after > 5 && (await nearby(page)).includes('Listening'), 'Gherkin: Esc fecha o vídeo e a cena volta a andar, com o avatar no mesmo lugar (ainda perto do totem)');
  await page.keyboard.press('KeyE');
  await page.waitForSelector('[data-testid="video-overlay"]', { timeout: 10000 });
  await page.click('[data-testid="video-overlay"] .video-close');
  await page.waitForFunction(() => !document.querySelector('[data-testid="video-overlay"]'), { timeout: 5000 });
  check(true, 'o botão Fechar também volta à sala');

  // 3. Clicar no totem (o avatar está diante dele): procura o totem na metade de cima da cena.
  const canvas = await (await page.$('[data-testid="room-canvas"] canvas')).boundingBox();
  let clicked = false;
  for (let row = 0; row < 6 && !clicked; row++) {
    for (let col = 0; col < 7 && !clicked; col++) {
      await page.mouse.click(canvas.x + canvas.width * (0.2 + col * 0.1), canvas.y + canvas.height * (0.08 + row * 0.08));
      clicked = (await overlayStatus(page)) !== null;
    }
  }
  check(clicked && (await page.$eval('[data-testid="video-overlay"] h2', (el) => el.textContent)).includes('Listening'), 'Gherkin: clicar no totem abre o vídeo dele');
  if (clicked) await page.keyboard.press('Escape');

  // 4. O master: o link que não é do YouTube não é gravado; o de youtu.be com si= vira só o ID.
  await page.$eval('#root', () => document.querySelector('section.config')?.scrollIntoView());
  const linkInput = await page.$('section.config input:not([type])');
  await linkInput.click({ clickCount: 3 });
  await linkInput.type('https://vimeo.com/123456');
  await page.click('section.config .publish');
  const refused = await page.$eval('[data-testid="config-result"]', (el) => el.textContent);
  await linkInput.click({ clickCount: 3 });
  await linkInput.type('https://youtu.be/dQw4w9WgXcQ?si=compartilhado');
  await page.click('section.config .publish');
  const accepted = await page.$eval('[data-testid="config-result"]', (el) => el.textContent);
  check(refused.includes('nada foi gravado') && accepted.includes('dQw4w9WgXcQ'), 'Gherkin: o link que não é do YouTube é recusado sem gravar; o link com si= grava só o ID', accepted);

  // 5a. O vídeo removido: o master aponta o totem para um vídeo que não existe, e o aluno, ainda diante dele, vê o aviso.
  await linkInput.click({ clickCount: 3 });
  await linkInput.type('https://www.youtube.com/watch?v=zzzzzzzzzz0');
  await page.click('section.config .publish');
  await page.$eval('[data-testid="scene"]', (el) => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status === 'failed', { timeout: 15000 });
  const failedText = await page.$eval('[data-testid="video-overlay"] [role="alert"]', (el) => ({ text: el.textContent, href: el.querySelector('a')?.href }));
  check(failedText.text.includes('não está disponível') && failedText.href === 'https://www.youtube.com/watch?v=zzzzzzzzzz0', 'o vídeo removido mostra o aviso, com o link para abrir no YouTube');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-video-removido.png` });
  await page.keyboard.press('Escape');

  // 5b. A rede bloqueia o YouTube: o aviso depois do prazo.
  const blocked = await browser.newPage();
  await watch(blocked, { blockPlayer: true });
  await blocked.setViewport({ width: 1100, height: 900 });
  await blocked.goto(`${URL_}?timeout=1500`);
  await blocked.waitForFunction(() => (window.__frames ?? 0) > 10, { timeout: 30000 });
  await holdUntil(blocked, 'KeyW', () => document.querySelector('[data-testid="nearby"]')?.textContent.includes('Listening'));
  await blocked.keyboard.press('KeyE');
  await blocked.waitForFunction(() => document.querySelector('[data-testid="video-overlay"]')?.dataset.status === 'failed', { timeout: 15000 });
  const noResponse = await blocked.$eval('[data-testid="video-overlay"] [role="alert"]', (el) => el.textContent);
  check(noResponse.includes('bloqueando o YouTube'), 'com a rede bloqueando o YouTube, o aviso aparece depois do prazo, com o link');
  await blocked.close();

  // ---------------------------------------------------------------- celular
  const phone = await browser.newPage();
  await watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForFunction(() => (window.__frames ?? 0) > 10, { timeout: 30000 });
  await phone.waitForSelector('[data-testid="joystick"]', { timeout: 15000 });
  await phone.$eval('[data-testid="joystick"]', (el) => el.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const joy = await (await phone.$('[data-testid="joystick"]')).boundingBox();
  const cx = joy.x + joy.width / 2;
  const cy = joy.y + joy.height / 2;
  await phone.touchscreen.touchStart(cx, cy);
  for (let i = 1; i <= 5; i++) await phone.touchscreen.touchMove(cx, cy - 9 * i);
  const reached = await phone.waitForFunction(() => document.querySelector('[data-testid="nearby"]')?.textContent.includes('Listening'), { timeout: 30000 }).then(() => true, () => false);
  await phone.touchscreen.touchEnd();
  await sleep(300);
  const watchBtn = await phone.$('[data-testid="totem-prompt"] button');
  if (watchBtn) await watchBtn.tap();
  const opened = await phone.waitForSelector('[data-testid="video-overlay"]', { timeout: 10000 }).then(() => true, () => false);
  const fits = await phone.evaluate(() => {
    const o = document.querySelector('[data-testid="video-overlay"]')?.getBoundingClientRect();
    return { overlay: o ? Math.round(o.width) : 0, scroll: document.documentElement.scrollWidth, vw: innerWidth };
  });
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/4-celular-video.png` });
  check(reached && opened && fits.overlay === fits.vw && fits.scroll <= fits.vw, 'no celular, o joystick leva ao totem, Assistir abre o vídeo na tela inteira, e nada passa da largura', `${fits.overlay}px de ${fits.vw}px`);
  await phone.close();

  check(playerRequests.every((u) => u.host === PLAYER_HOST && !u.searchParams.has('si')), 'o player é sempre o youtube-nocookie, sem o parâmetro de compartilhamento', `${playerRequests.length} aberturas`);
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
