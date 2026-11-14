// Prova no Chrome headless (WebGL por software, SwiftShader), com o build de verdade, os cenários da US56:
//   1. a sessão completa (as 4 rodadas) gera o relatório: FPS, tempo de quadro, draw calls, DPR, memória e MB;
//   2. Cenário "qualidade cai sozinha": com uma GPU fraca simulada (?custoMp: o tempo do quadro cresce com os pixels,
//      porque no headless o FPS do SwiftShader oscila com a carga da máquina), a rodada de DPR fixo fica abaixo de 30
//      FPS; a adaptativa baixa a resolução até o piso e o FPS volta ao orçamento;
//   3. achado: na visão orbital (frameloop "demand"), o monitor ligado à força leria FPS falso e baixaria a resolução
//      à toa; com a regra (monitor só no "always"), a resolução fica no teto;
//   4. a sombra do avatar em plano com textura custa menos draw calls que o ContactShadows;
//   5. Cenário "asset acima do orçamento": a trava de tamanho passa no build e falha com um modelo de 1,8 MB, dizendo
//      o arquivo e o limite;
//   6. num celular emulado, a página cabe na largura e mede.
// E nenhum erro na página nem requisição externa. Os números do SwiftShader não valem como aparelho: os de verdade
// ficam em results/.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { build, preview } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = '.e2e-dist';
const PORT = 4196;
const BASE = `http://localhost:${PORT}/`;

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
const row = (r) => `${r.scenario}/${r.quality}: ${r.frames.fpsMedian} FPS, 1% baixo ${r.frames.fpsLow1}, quadro p95 ${r.frames.frameMsP95} ms, ${r.drawCalls.max} draw calls, DPR ${r.dpr.start} ➔ ${r.dpr.end}`;

await build({ logLevel: 'warn', base: '/', build: { outDir: OUT, emptyOutDir: true } });
const server = await preview({ logLevel: 'warn', build: { outDir: OUT }, preview: { port: PORT, strictPort: true } });

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
  });
  const errors = [];
  const foreign = new Set();
  const open = async (query, { viewport = { width: 1280, height: 800, deviceScaleFactor: 2 }, cpu = 1 } = {}) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.host === `localhost:${PORT}` || url.protocol === 'data:' || url.protocol === 'blob:') return r.continue();
      foreign.add(url.host);
      return r.abort();
    });
    await page.setViewport(viewport);
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(`${BASE}?${query}`, { waitUntil: 'load' });
    return page;
  };
  const result = async (page, timeoutS) => {
    await page.waitForFunction(() => !!window.__result, { timeout: timeoutS * 1000, polling: 500 });
    return page.evaluate(() => window.__result);
  };
  /**
   * Abre, espera o relatório e fecha a aba (uma aba de cada vez: a de trás não ganha quadros no headless). Se a rodada
   * não termina (no runner do CI, o SwiftShader às vezes perde o contexto WebGL e a cena para de desenhar), mostra o
   * diagnóstico e repete o caso uma vez, numa aba nova; a segunda falha derruba o e2e.
   */
  const measure = async (query, timeoutS, opts, attempt = 1) => {
    const page = await open(query, opts);
    try {
      return await result(page, timeoutS);
    } catch (e) {
      const why = await page
        .evaluate(() => JSON.stringify({ contextLost: window.__contextLost ?? 0, bench: window.__bench, status: document.querySelector('[data-testid="status"]')?.textContent }))
        .catch(() => 'sem diagnóstico');
      console.log(`   ⚠️ a rodada "${query}" não terminou em ${timeoutS} s (tentativa ${attempt}): ${why}`);
      if (attempt >= 2) throw e;
    } finally {
      await page.close();
    }
    return measure(query, timeoutS, opts, attempt + 1);
  };
  const small = { viewport: { width: 800, height: 500, deviceScaleFactor: 1 } };

  // 1. A sessão completa (tela pequena: no headless a GPU é a CPU).
  {
    const page = await open('auto=1&s=4&aquecimento=2', small);
    const r = await result(page, 300);
    check(r.runs.length === 4 && r.runs.every((x) => x.frames.frames >= 3 && x.drawCalls.max > 0 && x.simulatedFillCostMs === 0), 'a sessão mede as 4 rodadas (curso e estresse, DPR fixo e adaptativo)', r.runs.map((x) => `${x.scenario}/${x.quality} ${x.frames.frames} quadros`).join('; '));
    for (const x of r.runs) console.log(`   ${row(x)}`);
    const curso = r.runs.find((x) => x.scenario === 'curso' && x.quality === 'fixo');
    const stress = r.runs.find((x) => x.scenario === 'estresse' && x.quality === 'fixo');
    check(curso.drawCalls.max <= 100 && stress.drawCalls.max > 100, 'a cidade do curso cabe nos 100 draw calls do celular; a de 200 prédios passa (o limite de escala)', `${curso.drawCalls.max} e ${stress.drawCalls.max}`);
    check(r.firstLoad.value > 0 && r.firstLoad.value <= r.firstLoad.limit, 'os MB do primeiro acesso são medidos e cabem no orçamento', `${r.firstLoad.value} MB, limite ${r.firstLoad.limit} MB`);
    check(r.runs.every((x) => typeof x.heapMB === 'number' && x.heapMB > 0), 'a memória do JavaScript é medida', r.runs.map((x) => `${x.heapMB} MB`).join(', '));
    check(typeof r.device.gpu === 'string' && r.device.cores > 0 && r.device.class === 'desktop', 'o relatório identifica o aparelho (GPU, núcleos, classe)', `${r.device.gpu?.slice(0, 40)}…, ${r.device.cores} núcleos`);
    const json = JSON.parse(await page.$eval('[data-testid="json"]', (el) => el.value));
    check(json.runs.length === 4 && json.bench === 'bench-r3f-low-end-budget', 'o JSON para o results/ aparece na página, igual ao relatório');
    await page.close();
  }

  // 2. Cenário: qualidade cai sozinha num aparelho lento. A GPU fraca é simulada: 120 ms por megapixel desenhado
  //    (numa tela de 640×400 em DPR 2, ~120 ms por quadro; no piso de 0,75, ~17 ms).
  {
    const slow = { viewport: { width: 640, height: 400, deviceScaleFactor: 2 } };
    const f = (await measure('auto=1&rodadas=curso:fixo&s=4&aquecimento=2&custoMp=120', 120, slow)).runs[0];
    const a = (await measure('auto=1&rodadas=curso:adaptativo&s=6&aquecimento=16&custoMp=120', 180, slow)).runs[0];
    console.log(`   GPU fraca simulada: ${row(f)} | ${row(a)}`);
    check(f.frames.fpsMedian < 30, 'Dado o campus abaixo de 30 FPS com o DPR fixo de hoje', `${f.frames.fpsMedian} FPS`);
    check(a.dpr.start === 2 && a.dpr.end < 2 && a.dpr.end >= 0.75, 'Então a resolução baixa sozinha (o quanto precisa, sem passar do piso)', `DPR ${a.dpr.start} ➔ ${a.dpr.end}`);
    check(a.frames.fpsMedian >= 30, 'E o FPS volta ao orçamento (30 ou mais)', `${a.frames.fpsMedian} FPS`);
    // Uma GPU fraca demais, que nem no piso chega a 30 FPS: a resolução para no piso e não desce mais.
    const h = (await measure('auto=1&rodadas=curso:adaptativo&s=4&aquecimento=22&custoMp=250', 180, slow)).runs[0];
    console.log(`   GPU fraca demais: ${row(h)}`);
    check(h.dpr.end === 0.75 && h.dpr.min === 0.75, 'numa GPU fraca demais, a resolução desce até o piso e para nele', `DPR ${h.dpr.start} ➔ ${h.dpr.end}, menor ${h.dpr.min}`);
  }

  // 3. Achado: o monitor no frameloop "demand".
  {
    const forced = (await measure('auto=1&rodadas=curso:adaptativo&camera=orbital&monitor=forcado&s=4&aquecimento=8', 90, small)).runs[0];
    const rule = (await measure('auto=1&rodadas=curso:adaptativo&camera=orbital&s=4&aquecimento=8', 90, small)).runs[0];
    check(forced.frames.fpsMedian < 10 && forced.dpr.end < forced.dpr.start, 'na visão orbital, o monitor ligado à força lê os quadros esparsos como FPS baixo e baixa a resolução à toa', `${forced.frames.fpsMedian} "FPS", DPR ${forced.dpr.start} ➔ ${forced.dpr.end}`);
    check(rule.dpr.end === rule.dpr.start, 'com a regra (monitor só no frameloop "always"), a resolução fica no teto', `DPR ${rule.dpr.start} ➔ ${rule.dpr.end}`);
  }

  // 4. Sombra do avatar.
  {
    const blob = (await measure('auto=1&rodadas=curso:fixo&s=3&aquecimento=2', 60, small)).runs[0];
    const contact = (await measure('auto=1&rodadas=curso:fixo&s=3&aquecimento=2&sombraAvatar=contact', 60, small)).runs[0];
    check(blob.frames.frames > 0 && contact.frames.frames > 0 && contact.drawCalls.max > blob.drawCalls.max, 'a sombra do avatar em plano com textura custa menos draw calls que o ContactShadows (que renderiza a cena de novo)', `${blob.drawCalls.max} contra ${contact.drawCalls.max}`);
  }

  // 6. Celular emulado.
  {
    const page = await open('auto=1&rodadas=curso:adaptativo&s=3&aquecimento=2', { viewport: { width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true } });
    const r = await result(page, 90);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(r.device.class === 'phone' && r.runs[0].frames.frames > 0 && overflow <= 0, 'no celular emulado, a página mede como celular e cabe na largura', `classe ${r.device.class}, sobra ${overflow}px`);
    await page.close();
  }

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição externa', [...foreign].join(', '));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

// 5. Cenário: asset acima do orçamento barra o PR (a trava roda no build, sem navegador).
const size = (dir) => {
  try {
    return { code: 0, out: execFileSync('node', ['scripts/size-budget.mjs', dir, 'budget.json'], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};
const okRun = size(OUT);
check(okRun.code === 0, 'a trava de tamanho passa no build do benchmark', okRun.out.split('\n')[0]);
const tmp = mkdtempSync(join(tmpdir(), 'size-'));
try {
  cpSync(OUT, tmp, { recursive: true });
  writeFileSync(join(tmp, 'assets', 'predio-novo.glb'), randomBytes(1800 * 1024));
  const bad = size(tmp);
  check(bad.code === 1 && bad.out.includes('assets/predio-novo.glb') && bad.out.includes('limite de 1024 KB'), 'Cenário: um modelo novo de 1,8 MB faz a trava falhar, com o arquivo e o limite', bad.out.split('\n').find((l) => l.includes('❌')) ?? '');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
}

if (failed) {
  console.error('e2e: FALHOU');
  process.exit(1);
}
console.log('e2e: todos os cenários passaram');
