// Prova com mouse, teclado e toque reais no Chrome headless (WebGL por software):
//   1. no modo Orbital, passar o mouse num prédio mostra o cursor de clicável; clicar o seleciona (aviso + destaque);
//   2. o botão Entrar abre a sala e I abre as informações; a seleção continua depois de fechar a janela;
//   3. clicar em outro prédio troca a seleção; × e Esc desfazem;
//   4. arrastar a câmera começando em cima de um prédio NÃO seleciona;
//   5. voltando ao modo Avatar, a seleção some;
//   6. num celular (toque), o campus abre no Orbital e tocar num prédio e em Entrar abre a sala;
//   e nenhum erro nem requisição a outra origem.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4188;
const URL_ = `http://localhost:${PORT}/`;
const CAMPUS = JSON.parse(readFileSync('src/Content/campus.json', 'utf8'));
// A mesma vista geral da OrbitCamera (lida do código, para o e2e nunca divergir dela).
const OVERVIEW = JSON.parse(readFileSync('src/Presentation/Engine3D/OrbitCamera.tsx', 'utf8').match(/OVERVIEW[^=]*=\s*(\[[^\]]+\])/)[1]);

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

/** Onde o meio de um prédio aparece na tela, com a câmera na vista geral do Orbital. */
async function screenPoint(page, id) {
  const b = CAMPUS.buildings.find((x) => x.id === id);
  const box = await (await page.$('canvas')).boundingBox();
  const camera = new PerspectiveCamera(50, box.width / box.height, 0.1, 1000);
  camera.position.set(...OVERVIEW);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const p = new Vector3(b.position[0], b.size[1] / 2, b.position[1]).project(camera);
  return { x: box.x + ((p.x + 1) / 2) * box.width, y: box.y + ((1 - p.y) / 2) * box.height };
}

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

  const page = await browser.newPage();
  watch(page);
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('canvas', { timeout: 30000 });
  await sleep(1500);

  const prompt = () => page.$eval('[data-testid="interaction-prompt"]', (el) => el.textContent).catch(() => null);
  const dialog = () => page.$eval('[role="dialog"]', (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent).catch(() => null);
  const clickBuilding = async (id) => {
    const p = await screenPoint(page, id);
    await page.mouse.click(p.x, p.y);
    await sleep(300);
  };
  const clickButton = (name) => page.$$eval('[data-testid="interaction-prompt"] button', (bs, n) => bs.find((b) => b.textContent.includes(n) || b.getAttribute('aria-label') === n)?.click(), name);

  // 1. Orbital: hover + clique.
  await page.keyboard.press('KeyC');
  await sleep(600);
  check(await page.$eval('button[aria-pressed="true"]', (b) => b.textContent === 'Orbital'), 'C liga o modo Orbital');
  check((await prompt()) === null, 'no Orbital, sem nada selecionado, não há aviso');
  const lib = await screenPoint(page, 'biblioteca');
  await page.mouse.move(lib.x, lib.y);
  await sleep(300);
  check(await page.evaluate(() => document.body.style.cursor === 'pointer'), 'com o mouse em cima da Biblioteca, o cursor vira "clicável"');
  await clickBuilding('biblioteca');
  check((await prompt())?.includes('Biblioteca') && (await prompt())?.includes('Escolha uma ação'), 'Gherkin: clicar na Biblioteca a seleciona e mostra o aviso com as ações', await prompt());

  // 2. Entrar (botão) e I (tecla).
  await clickButton('Entrar');
  check((await dialog()) === 'Sala: Biblioteca', 'Gherkin: o botão Entrar abre a sala');
  await page.keyboard.press('Escape');
  check((await dialog()) === null && (await prompt())?.includes('Biblioteca'), 'Esc fecha a sala e a seleção continua');
  await page.keyboard.press('KeyI');
  check((await dialog()) === 'Sobre: Biblioteca', 'Gherkin: a tecla I abre as informações do selecionado');
  await page.keyboard.press('Escape');

  // 3. Trocar a seleção; × e Esc desfazem.
  await clickBuilding('auditorio');
  check((await prompt())?.includes('Auditório'), 'clicar no Auditório troca a seleção', await prompt());
  await clickButton('Desfazer a seleção');
  await sleep(200);
  check((await prompt()) === null, 'o × desfaz a seleção');
  await clickBuilding('laboratorio');
  check((await prompt())?.includes('Laboratório'), 'clicar no Laboratório o seleciona');
  await page.keyboard.press('Escape');
  await sleep(200);
  check((await prompt()) === null && (await dialog()) === null, 'Esc (sem janela aberta) desfaz a seleção');

  // 4. Arrastar começando em cima de um prédio gira a câmera e não seleciona.
  const caf = await screenPoint(page, 'cafeteria');
  await page.mouse.move(caf.x, caf.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(caf.x + i * 15, caf.y + i * 3);
  await page.mouse.up();
  await sleep(400);
  check((await prompt()) === null, 'Gherkin: arrastar a câmera a partir da Cafeteria não a seleciona');

  // 5. Voltar ao Avatar desfaz a seleção.
  await page.keyboard.press('KeyC'); // volta ao Avatar (a câmera vai para trás dele)
  await page.keyboard.press('KeyC'); // e de novo ao Orbital, na vista geral
  await sleep(600);
  await clickBuilding('cafeteria');
  check((await prompt())?.includes('Cafeteria'), 'de volta à vista geral, clicar na Cafeteria a seleciona');
  await page.keyboard.press('KeyC');
  await sleep(300);
  check((await prompt()) === null, 'trocar para o Avatar desfaz a seleção (o avatar está longe dos prédios)');

  // 6. Celular: abre no Orbital; tocar no prédio e em Entrar.
  const phone = await browser.newPage();
  watch(phone);
  await phone.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await phone.goto(URL_);
  await phone.waitForSelector('canvas', { timeout: 30000 });
  await sleep(1500);
  check(await phone.$eval('button[aria-pressed="true"]', (b) => b.textContent === 'Orbital'), 'no celular (toque), o campus abre no Orbital');
  const t = await screenPoint(phone, 'biblioteca');
  await phone.touchscreen.tap(t.x, t.y);
  await sleep(400);
  const phonePrompt = await phone.$eval('[data-testid="interaction-prompt"]', (el) => el.textContent).catch(() => null);
  check(phonePrompt?.includes('Biblioteca'), 'tocar na Biblioteca a seleciona', phonePrompt);
  const enter = await phone.$$('[data-testid="interaction-prompt"] button');
  for (const b of enter) if ((await b.evaluate((x) => x.textContent)).includes('Entrar')) await b.tap();
  await sleep(300);
  check((await phone.$eval('[role="dialog"]', (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent).catch(() => null)) === 'Sala: Biblioteca', 'tocar em Entrar abre a sala');

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
