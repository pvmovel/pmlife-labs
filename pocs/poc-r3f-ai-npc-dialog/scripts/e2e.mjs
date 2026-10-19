// Prova com teclas reais no Chrome headless (WebGL por software) e o mock PHP de verdade (php -S):
//   1. longe de tudo não há aviso; andando em frente, o aviso "conversar" do Guia do Museu aparece dentro do raio (2 m);
//   2. E abre a conversa com o foco no campo; duas perguntas: a segunda resposta cita a primeira (o histórico
//      chegou ao servidor) e o pedido levou a troca anterior; digitar w/s no campo não move o avatar;
//   3. Esc fecha e o aviso volta; persona fora da lista branca ➔ 400 INVALID_PERSONA;
//   4. voltando para longe, o aviso some; nenhum erro e nenhuma requisição a outra origem.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { build } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = 'e2e-dist'; // sem ponto no nome: o php -S não serve pastas ocultas
const PORT = 4187;
const HOST = `127.0.0.1:${PORT}`;
const PHP = process.env.PHP_BIN ?? 'php';
const NPC_Z = 7; // Guia do Museu
const BODY = 0.4;
const RADIUS = 2; // raio padrão de conversa, a partir do corpo
const PROMPT = 'Pressione [E] para conversar';

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

// A demo (dist/) chama ../public/npc_chat.php; servindo a pasta da PoC, a página fica em /.e2e-dist/ e o mock em /public/.
await build({ logLevel: 'warn', base: `/${OUT}/`, build: { outDir: OUT, emptyOutDir: true } });
const php = spawn(PHP, ['-S', HOST, '-t', '.'], { stdio: 'ignore' });
let phpUp = false;
for (let i = 0; i < 50 && !phpUp; i++) {
  await sleep(200);
  phpUp = await fetch(`http://${HOST}/${OUT}/`).then((r) => r.ok, () => false);
}

let browser;
try {
  if (!phpUp) throw new Error(`php -S não subiu (PHP_BIN=${PHP})`);
  browser = await puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  const foreign = new Set();
  const chats = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host && host !== HOST) foreign.add(host);
    if (r.url().endsWith('/public/npc_chat.php') && r.method() === 'POST') chats.push(JSON.parse(r.postData() ?? '{}'));
  });
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(`http://${HOST}/${OUT}/`);
  await page.waitForSelector('canvas', { timeout: 30000 });

  const z = () => page.$eval('[data-testid="avatar"]', (el) => +el.dataset.z);
  const prompt = () => page.$eval('[data-testid="interaction-prompt"]', (el) => el.textContent).catch(() => null);
  const dialog = () => page.$eval('[role="dialog"]', (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent).catch(() => null);
  const answers = () => page.$$eval('[data-testid="npc-answer"]', (els) => els.map((el) => el.textContent));
  const holdUntil = async (key, fn, arg) => {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(fn, { timeout: 30000, polling: 50 }, arg);
    } finally {
      await page.keyboard.up(key);
    }
  };
  const ask = async (text, count) => {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="npc-answer"]').length === n, { timeout: 15000 }, count);
  };

  // 1. Longe: sem aviso. W até o aviso aparecer: tem que ser o do NPC, dentro do raio.
  check((await prompt()) === null, 'no ponto de partida não há aviso');
  await holdUntil('KeyW', () => !!document.querySelector('[data-testid="interaction-prompt"]'));
  await sleep(250); // o painel de posição atualiza a cada 100 ms
  const gap = (await z()) - NPC_Z - BODY;
  check(gap <= RADIUS + 0.35, 'o aviso aparece ao entrar no raio de 2 m do NPC', `a ${gap.toFixed(2)} m do corpo`);
  check((await prompt())?.includes(PROMPT) && (await prompt())?.includes('Guia do Museu'), 'aviso de conversa com o nome do NPC', await prompt());

  // 2. E abre a conversa; duas perguntas pelo mock PHP.
  await page.keyboard.press('KeyE');
  check((await dialog()) === 'Conversa: Guia do Museu', 'E abre a conversa com o NPC');
  check(await page.$eval('[data-testid="npc-input"]', (el) => el === document.activeElement), 'o foco vai direto para o campo da pergunta');
  await ask('Quais alas existem?', 1);
  const [first] = await answers();
  check(first.includes('Sou a guia do museu.') && !first.includes('Antes você perguntou'), 'a 1ª resposta vem da persona, sem histórico', first);
  const before = await z();
  await ask('wwww ssss e o relógio?', 2);
  const second = (await answers())[1];
  check(second.includes('Antes você perguntou: “Quais alas existem?” (memória: 1 de 3 trocas)'), 'a 2ª resposta cita a 1ª pergunta: o histórico chegou ao servidor', second);
  check(chats.length === 2 && chats[0].history.length === 0 && chats[1].history[0]?.question === 'Quais alas existem?' && chats[1].persona === 'museum_guide', 'o pedido leva a persona e a troca anterior', JSON.stringify(chats[1]?.history));
  check((await z()) === before, 'digitar w e s no campo não move o avatar');

  // 3. Esc fecha; a lista branca do servidor recusa persona desconhecida.
  await page.keyboard.press('Escape');
  check((await dialog()) === null && (await prompt())?.includes(PROMPT), 'Esc fecha a conversa e o aviso volta');
  const invalid = await page.evaluate(async () => {
    const r = await fetch('/public/npc_chat.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: 'hacker', message: 'oi' }) });
    return { status: r.status, body: await r.json() };
  });
  check(invalid.status === 400 && invalid.body.error?.code === 'INVALID_PERSONA', 'persona fora da lista branca ➔ 400 INVALID_PERSONA', `${invalid.status}`);

  // 4. S até sair do raio: o aviso some.
  await holdUntil('KeyS', () => !document.querySelector('[data-testid="interaction-prompt"]'));
  await sleep(250);
  check((await z()) - NPC_Z - BODY > RADIUS - 0.35, 'ao se afastar, o aviso some', `a ${((await z()) - NPC_Z - BODY).toFixed(2)} m do corpo`);

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.size === 0, 'nenhuma requisição a outra origem', [...foreign].join(', '));
} catch (e) {
  check(false, 'e2e interrompido', e.message);
} finally {
  await browser?.close();
  php.kill();
  rmSync(OUT, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
