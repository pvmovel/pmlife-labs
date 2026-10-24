// Prova com teclas, mouse e toque reais no Chrome headless (WebGL por software) os cenários da US32 e o orçamento:
//   1. andando até a Biblioteca, E abre a sala 3D (medindo o tempo até o primeiro quadro: até 1 s);
//   2. na sala, andar até a estação e apertar E conclui a missão e soma o XP;
//   3. andar de ré até a porta volta ao campus diante da porta, olhando para fora; Esc faz o mesmo;
//   4. no Orbital, clicar no Laboratório e em Entrar abre a sala dele;
//   5. desempenho: a sala não pesa mais que o campus com a CPU 4× mais lenta (o headless desenha por software, ~20 FPS
//      até no campus: os 30 FPS do orçamento são conferidos num celular com GPU, em homolog); chunk ≤ 50 KB com gzip;
//   6. num celular emulado (toque), Entrar abre a sala com o joystick, e o joystick leva o avatar de volta pela porta;
//   e nenhum erro na página nem requisição a outra origem.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PerspectiveCamera, Vector3 } from 'three';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4192;
const URL_ = `http://localhost:${PORT}/`;
const CAMPUS = JSON.parse(readFileSync('src/Content/campus.json', 'utf8'));
const OVERVIEW = JSON.parse(readFileSync('src/Presentation/Engine3D/OrbitCamera.tsx', 'utf8').match(/OVERVIEW[^=]*=\s*(\[[^\]]+\])/)[1]);
const BUDGET = { entryMs: 1000, chunkKb: 50 };

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

async function screenPoint(page, id, at = [0, 0.5, 0]) {
  const b = CAMPUS.buildings.find((x) => x.id === id);
  const box = await (await page.$('canvas')).boundingBox();
  const camera = new PerspectiveCamera(50, box.width / box.height, 0.1, 1000);
  camera.position.set(...OVERVIEW);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  // `at`: ponto do prédio em frações do tamanho (x e z a partir do centro, y a partir do chão).
  const p = new Vector3(b.position[0] + at[0] * b.size[0], at[1] * b.size[1], b.position[1] + at[2] * b.size[2]).project(camera);
  return { x: box.x + ((p.x + 1) / 2) * box.width, y: box.y + ((1 - p.y) / 2) * box.height };
}

// Um ponto do prédio que esteja de fato sobre a cena: no runner, com outras fontes, o HUD cresce e pode cobrir o centro
// do prédio (o clique cairia no painel, não no 3D). Testa o centro, o topo e as faces e devolve o primeiro descoberto.
async function visiblePoint(page, id) {
  const tried = [];
  for (const at of [[0, 0.5, 0], [0, 0.95, 0], [0, 0.5, 0.45], [0.4, 0.5, 0.45], [-0.4, 0.5, 0.45], [0.4, 0.9, 0], [-0.4, 0.9, 0]]) {
    const pt = await screenPoint(page, id, at);
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}` : 'nada';
    }, pt);
    if (hit === 'canvas') return pt;
    tried.push(`${at.join(',')} ➔ ${hit}`);
  }
  throw new Error(`nenhum ponto do prédio ${id} está descoberto na tela: ${tried.join('; ')}`);
}

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const foreign = new Set();
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const host = new URL(r.url()).host;
      if (host && host !== `localhost:${PORT}`) foreign.add(host);
    });
  };

  const page = await browser.newPage();
  watch(page);
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('canvas', { timeout: 30000 });

  const scene = () => page.$eval('[data-testid="scene"]', (el) => ({ place: el.dataset.place, entryMs: el.dataset.entryMs }));
  const avatar = () => page.$eval('[data-testid="avatar"]', (el) => ({ x: +el.dataset.x, z: +el.dataset.z, h: +el.dataset.heading }));
  const xp = () => page.$eval('[data-testid="xp"]', (el) => +el.dataset.xp);
  const holdUntil = async (key, fn, arg) => {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(fn, { timeout: 30000, polling: 50 }, arg);
    } finally {
      await page.keyboard.up(key);
    }
  };
  const placeIs = (p) => page.waitForFunction((v) => document.querySelector('[data-testid="scene"]').dataset.place === v, { timeout: 30000 }, p);
  const enter = async () => {
    await page.keyboard.press('KeyE');
    await placeIs('interior:biblioteca');
    await page.waitForFunction(() => document.querySelector('[data-testid="scene"]').dataset.entryMs !== '', { timeout: 30000 });
    await page.waitForSelector('[data-testid="interior-canvas"] canvas', { timeout: 30000 });
  };

  // 1. Até a Biblioteca e E.
  await holdUntil('KeyW', () => !!document.querySelector('[data-testid="interaction-prompt"]'));
  await enter();
  const first = await scene();
  check(first.place === 'interior:biblioteca' && +first.entryMs <= BUDGET.entryMs, `Gherkin: perto da Biblioteca, E abre a cena interna (até ${BUDGET.entryMs} ms)`, `${first.entryMs} ms, inclusive o download do chunk da sala`);

  // 2. Estação.
  await holdUntil('KeyW', () => document.querySelector('[data-testid="station-prompt"]')?.textContent.includes('Ler o texto'));
  await page.keyboard.press('KeyE');
  await sleep(200);
  check((await xp()) === 300 && (await page.$eval('[data-testid="station-prompt"]', (el) => el.textContent)).includes('Missão concluída'), 'Gherkin: andar até a estação e usar com E conclui a missão e soma o XP', `${await xp()} XP`);

  // 3. Porta e Esc.
  await holdUntil('KeyS', () => document.querySelector('[data-testid="scene"]').dataset.place === 'campus');
  await sleep(400);
  let a = await avatar();
  check(Math.abs(a.x) < 0.05 && Math.abs(a.z - 3.5) < 0.05 && Math.abs(a.h) < 0.01, 'Gherkin: saindo de ré pela porta, o campus volta com o avatar diante da porta, olhando para fora', `x ${a.x.toFixed(2)} z ${a.z.toFixed(2)}`);
  await enter();
  const second = +(await scene()).entryMs;
  await page.keyboard.press('Escape');
  await placeIs('campus');
  await sleep(400);
  a = await avatar();
  check(Math.abs(a.z - 3.5) < 0.05, 'Gherkin: Esc também volta ao campus diante da porta', `z ${a.z.toFixed(2)}; 2ª entrada em ${second} ms, com o chunk em cache`);

  // 5. Desempenho com a CPU 4× mais lenta: a sala contra o campus, nas mesmas condições.
  const cdp = await page.createCDPSession();
  const measureFps = async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await sleep(500);
    const value = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(tick);
      }),
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return value;
  };
  const campusFps = await measureFps();
  await enter();
  const roomFps = await measureFps();
  check(roomFps >= campusFps * 0.9, 'desempenho: com a CPU 4× mais lenta, a sala não pesa mais que o campus', `sala ${roomFps} FPS × campus ${campusFps} FPS (WebGL por software no headless; 30 FPS conferidos num celular com GPU)`);
  const chunk = readdirSync(`${OUT}/assets`).find((f) => /^InteriorCanvas-.*\.js$/.test(f));
  const kb = chunk ? gzipSync(readFileSync(`${OUT}/assets/${chunk}`)).length / 1024 : Infinity;
  check(kb <= BUDGET.chunkKb, `desempenho: chunk da sala ≤ ${BUDGET.chunkKb} KB com gzip, carregado só ao entrar`, `${chunk}: ${kb.toFixed(1)} KB`);
  await page.keyboard.press('Escape');
  await placeIs('campus');

  // 4. Orbital ➔ Laboratório ➔ Entrar.
  // Saindo da sala, a tela escurece e clareia: enquanto isso o atalho C fica desligado e a camada do escurecimento cobre
  // a cena (achado do CI: num runner lento, o C se perdia e o clique caía no escurecimento). Espera o fim do escurecimento
  // e confirma o modo Orbital pelo botão (aria-pressed) antes de clicar no prédio.
  await page.waitForFunction(() => !document.querySelector('.fade.on'), { timeout: 30000 });
  const orbitalOn = () => page.$$eval('button[aria-keyshortcuts="C"]', (bs) => bs.some((b) => b.textContent.includes('Orbital') && b.getAttribute('aria-pressed') === 'true'));
  for (let i = 0; i < 5 && !(await orbitalOn()); i++) {
    await page.keyboard.press('KeyC');
    await page.waitForFunction(() => [...document.querySelectorAll('button[aria-keyshortcuts="C"]')].some((b) => b.textContent.includes('Orbital') && b.getAttribute('aria-pressed') === 'true'), { timeout: 3000 }).catch(() => undefined);
  }
  if (!(await orbitalOn())) throw new Error('a tecla C não ligou o modo Orbital');
  // Depois do Esc o avatar está diante da Biblioteca, então o aviso dela já está na tela: esperar o do Laboratório
  // (e clicar de novo se a câmera ainda estava indo para a vista geral no primeiro clique).
  const labPrompt = () => page.waitForFunction(() => document.querySelector('[data-testid="interaction-prompt"]')?.textContent.includes('Laboratório'), { timeout: 5000 }).then(() => true, () => false);
  let labSelected = false;
  for (let i = 0; i < 4 && !labSelected; i++) {
    await sleep(800);
    const lab = await visiblePoint(page, 'laboratorio');
    await page.mouse.click(lab.x, lab.y);
    labSelected = await labPrompt();
  }
  if (!labSelected) throw new Error('o clique no Laboratório não o selecionou no Orbital');
  await page.$$eval('[data-testid="interaction-prompt"] button', (bs) => bs.find((b) => b.textContent.includes('Entrar'))?.click());
  await placeIs('interior:laboratorio');
  check(true, 'Gherkin: no Orbital, clicar no Laboratório e em Entrar abre a sala dele');

  // 6. Celular: toque.
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('canvas', { timeout: 30000 });
  await sleep(1200);
  // Como no e2e da US29: com as fontes do runner, a cena pode descer; o toque precisa cair dentro da tela.
  await phone.$eval('canvas', (el) => el.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const libPt = await visiblePoint(phone, 'biblioteca');
  await phone.touchscreen.tap(libPt.x, libPt.y);
  await phone.waitForSelector('[data-testid="interaction-prompt"]', { timeout: 15000 });
  for (const b of await phone.$$('[data-testid="interaction-prompt"] button')) if ((await b.evaluate((x) => x.textContent)).includes('Entrar')) await b.tap();
  await phone.waitForFunction(() => document.querySelector('[data-testid="scene"]').dataset.place === 'interior:biblioteca', { timeout: 30000 });
  await phone.waitForSelector('[data-testid="joystick"]', { timeout: 15000 });
  await phone.$eval('[data-testid="joystick"]', (el) => el.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const joy = await (await phone.$('[data-testid="joystick"]')).boundingBox();
  const cx = joy.x + joy.width / 2;
  const cy = joy.y + joy.height / 2;
  await phone.touchscreen.touchStart(cx, cy);
  for (let i = 1; i <= 5; i++) await phone.touchscreen.touchMove(cx, cy + 9 * i);
  const back = await phone.waitForFunction(() => document.querySelector('[data-testid="scene"]').dataset.place === 'campus', { timeout: 30000 }).then(() => true, () => false);
  await phone.touchscreen.touchEnd();
  check(back, 'no celular, Entrar abre a sala com o joystick, e arrastar para baixo leva o avatar de volta pela porta');

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
