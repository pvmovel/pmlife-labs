// Prova no Chrome headless, com o PHP e o MySQL de verdade, que a questão em 2 etapas (US59) se faz SÓ pelo teclado:
//   1. Tab até "Começar o quiz" e Enter: a janela abre com as 5 questões sorteadas (até sair uma prova com uma questão
//      em 2 etapas com o meio ponto e outra sem);
//   2. o porquê (2ª etapa) fica escondido até a resposta (1ª etapa) ter uma escolha; com Espaço na resposta, ele aparece
//      logo abaixo e o leitor de tela ouve o aviso; o "Enviar" só liga com as duas etapas respondidas;
//   3. tudo certo, menos o porquê das duas questões em 2 etapas: 3,5 de 5, aprovado com 70% e +100 XP; a devolutiva diz
//      cada etapa, o meio ponto e a explicação do porquê (o Gherkin "Resposta certa, porquê errado");
//   4. Esc fecha; refazer tudo errado reprova, e a página mostra quanto falta da espera, com o botão desligado;
//   5. num celular, a janela cabe na largura da tela;
//   6. nenhum erro na página e nenhum pedido a outra origem.
// Sem SPIKE_MYSQL_* o e2e é pulado (precisa do banco). Com QUIZ_BASE_URL, usa um servidor já no ar (o e2e-router.php).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

if (!process.env.SPIKE_MYSQL_HOST && !process.env.QUIZ_BASE_URL) {
  console.log('⚠️  Sem SPIKE_MYSQL_*: o e2e precisa do banco e foi pulado.');
  process.exit(0);
}
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

let server = null;
let BASE = process.env.QUIZ_BASE_URL;
if (!BASE) {
  const port = 4200;
  BASE = `http://127.0.0.1:${port}`;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'scripts/e2e-router.php'], { env: { ...process.env, QUIZ_E2E: '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${BASE}/index.html`).then(() => true, () => false)) break;
    await sleep(100);
  }
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const errors = [];
const foreign = [];
const origin = new URL(BASE).origin;

async function openPage(viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => new URL(r.url()).origin !== origin && foreign.push(r.url()));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#start:not([disabled])');
  return page;
}
const active = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const text = (page, sel) => page.$eval(sel, (n) => n.textContent ?? '');
async function tabTo(page, id) {
  for (let i = 0; i < 15; i++) {
    if ((await active(page)) === id) return true;
    await page.keyboard.press('Tab');
  }
  return (await active(page)) === id;
}
/** Leva o foco ao elemento pelo id (como o Tab faria) e aperta as teclas. */
async function press(page, id, ...keys) {
  await page.$eval(`[id="${id}"]`, (n) => n.focus());
  for (const k of keys) await page.keyboard.press(k);
}

/**
 * Responde uma questão pelo teclado. `mode`: 'right' (a resposta certa), 'wrong' (errada; na questão em 2 etapas, a 1ª
 * etapa errada) ou 'reason' (só na questão em 2 etapas: a resposta certa e o porquê errado).
 */
async function answer(page, q, key, mode) {
  const name = `q${q.id}`;
  const right = mode === 'right';
  if (q.kind === 'twostep') {
    const first = q.first === 'single' ? key.option : String(key.value);
    const firstPick = mode === 'wrong' ? q.firstChoices.find((c) => c !== first) : first;
    await press(page, `${name}-${firstPick}`, 'Space');
    const reasonPick = mode === 'reason' ? q.reasons.find((r) => r !== key.reason) : key.reason;
    await press(page, `${name}-r-${reasonPick}`, 'Space');
  } else if (q.kind === 'single') {
    const pick = right ? key.option : q.options.find((o) => o !== key.option);
    await press(page, `${name}-${pick}`, 'Space');
  } else if (q.kind === 'multiple') {
    for (const o of right ? key.options : key.options.slice(1)) await press(page, `${name}-${o}`, 'Space');
  } else if (q.kind === 'truefalse') {
    await press(page, `${name}-${right ? key.value : !key.value}`, 'Space');
  } else if (q.kind === 'cloze') {
    let first = true;
    for (const [blank, value] of Object.entries(key.blanks)) {
      const id = `${name}-b${blank}`;
      const choices = await page.$eval(`[id="${id}"]`, (s) => [...s.options].map((o) => o.value).filter(Boolean));
      const target = right || !first ? value : choices.find((c) => c !== value);
      first = false;
      await page.$eval(`[id="${id}"]`, (n) => n.focus());
      for (let i = 0; i < 6 && (await page.$eval(`[id="${id}"]`, (s) => s.value)) !== target; i++) await page.keyboard.press('ArrowDown');
    }
  } else if (q.kind === 'ordering') {
    const target = right ? key.order : [...key.order].reverse();
    for (let pos = 0; pos < target.length; pos++) {
      const now = await page.$$eval(`#${name}-list li`, (lis) => lis.map((li) => li.dataset.id));
      const from = now.indexOf(target[pos]);
      if (from === pos) continue;
      await page.$eval(`[id="${name}-${target[pos]}"]`, (n) => n.focus());
      await page.keyboard.down('Alt');
      for (let k = 0; k < from - pos; k++) await page.keyboard.press('ArrowUp');
      await page.keyboard.up('Alt');
    }
  }
}

/** As questões da janela e o gabarito delas (pela rota do roteador de teste). */
async function questionsOf(page) {
  const qs = await page.$$eval('dialog fieldset[id^="q-"]', (fss) =>
    fss.map((fs) => ({
      id: Number(fs.id.slice(2)),
      kind: fs.dataset.kind,
      first: fs.dataset.first,
      half: fs.dataset.half === 'true',
      options: [...fs.querySelectorAll(':scope > label input')].map((i) => i.value),
      firstChoices: [...fs.querySelectorAll('fieldset[id$="-s1"] input')].map((i) => i.value),
      reasons: [...fs.querySelectorAll('fieldset[id$="-s2"] input')].map((i) => i.value),
    })),
  );
  const keys = await (await fetch(`${BASE}/__e2e/answers?ids=${qs.map((q) => q.id).join(',')}`)).json();
  return { qs, keys };
}

try {
  // Cada sessão nova é um aluno novo com um sorteio novo: abre até sair uma prova com uma questão em 2 etapas com o meio
  // ponto e outra sem, para os dois casos serem sempre testados. As tentativas das outras sessões só ficam abertas.
  let page = null;
  let tries = 0;
  let drawn = null;
  for (; tries < 15; tries++) {
    page = await openPage({ width: 1280, height: 900 });
    if (tries === 0) {
      check((await text(page, '#quiz-title')) === 'Astronomia: a resposta e o porquê', 'a página abre com o quiz de exemplo');
      check(await tabTo(page, 'start'), 'Tab leva ao botão "Começar o quiz"');
    } else {
      await page.$eval('#start', (n) => n.focus());
    }
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open] fieldset');
    drawn = await questionsOf(page);
    const two = drawn.qs.filter((q) => q.kind === 'twostep');
    if (two.some((q) => q.half) && two.some((q) => !q.half)) break;
    await page.browserContext().close();
  }
  const { qs, keys } = drawn;
  const half = qs.find((q) => q.kind === 'twostep' && q.half);
  const whole = qs.find((q) => q.kind === 'twostep' && !q.half);
  check(Boolean(half && whole), `uma prova com as duas questões em 2 etapas (com e sem meio ponto) em ${tries + 1} sorteio(s)`);
  check(qs.length === 5 && (await page.evaluate(() => document.activeElement?.closest('dialog') !== null)), 'Enter abre a janela com as 5 questões sorteadas e o foco dentro dela');
  const hidden = (q) => page.$eval(`[id="q${q.id}-s2"]`, (n) => n.hidden);
  check((await hidden(whole)) && (await hidden(half)), 'o porquê (2ª etapa) começa escondido');

  // A questão sem meio ponto primeiro, devagar: a resposta certa com Espaço revela o porquê, que o leitor de tela anuncia.
  const wholeFirst = whole.first === 'single' ? keys[whole.id].option : String(keys[whole.id].value);
  await press(page, `q${whole.id}-${wholeFirst}`, 'Space');
  await page.waitForFunction((id) => !document.getElementById(`q${id}-s2`).hidden, {}, whole.id);
  check(!(await hidden(whole)), 'com Espaço na resposta, o porquê aparece logo abaixo, sem ir ao servidor');
  await page.waitForFunction(() => (document.getElementById('announce')?.textContent ?? '').includes('porquê'));
  check(true, 'o leitor de tela ouve "Agora escolha o porquê"');
  await page.keyboard.press('Tab');
  check((await active(page)).startsWith(`q${whole.id}-r-`), 'Tab leva da resposta ao porquê', await active(page));
  check((await page.$eval('#submit', (b) => b.disabled)), 'sem o porquê, a questão não conta como respondida e o "Enviar" segue desligado');

  for (const q of qs) await answer(page, q, keys[q.id], q === half || q === whole ? 'reason' : 'right');
  check((await text(page, '#progress')) === 'Respondidas: 5 de 5' && !(await page.$eval('#submit', (b) => b.disabled)), 'com as 5 respondidas pelo teclado (as duas etapas), o "Enviar" liga');
  // Os textos dos porquês, lidos antes do envio (depois a janela troca a prova pela devolutiva).
  const reasonTexts = await page.$$eval(`[id^="q${whole.id}-r-"]`, (ins) => ins.map((i) => (i.closest('label')?.textContent ?? '').trim()).filter(Boolean));
  await press(page, 'submit', 'Enter');
  await page.waitForSelector('#verdict');
  const verdict = await text(page, '#verdict');
  check(verdict.startsWith('Aprovado com 70% (3,5 de 5)') && verdict.includes('+100 XP') && (await active(page)) === 'verdict', 'Enter envia: 3,5 de 5, aprovado com 70% no limite e +100 XP, com o foco no resultado', verdict);
  const result = (q) => page.$eval(`#r-${q.id}`, (li) => ({ credit: li.dataset.credit, text: li.textContent ?? '' }));
  const w = await result(whole);
  check(w.credit === '0' && w.text.includes('✗ Errado') && w.text.includes('Resposta: certa · Porquê: errado') && w.text.includes('Explicação:'), 'Gherkin "Resposta certa, porquê errado": sem o meio ponto, vale 0, e a explicação do porquê aparece', w.text);
  const h = await result(half);
  check(h.credit === '0.5' && h.text.includes('½ Meio ponto') && h.text.includes('Resposta: certa · Porquê: errado'), 'com o meio ponto, a resposta certa e o porquê errado valem 0,5', h.text);
  const body = await page.$eval('ul.results', (n) => n.textContent ?? '');
  check(reasonTexts.length === 3 && !reasonTexts.some((t) => body.includes(t)), 'a devolutiva não mostra o texto de nenhum porquê (nem o certo)');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.waitForFunction(() => document.getElementById('xp')?.textContent === '100');
  check((await text(page, '#start')) === 'Refazer (sem XP)', 'Esc fecha; o XP fica em 100 e o botão vira "Refazer (sem XP)"');

  await press(page, 'start', 'Enter');
  await page.waitForSelector('dialog[open] fieldset');
  const second = await questionsOf(page);
  for (const q of second.qs) await answer(page, q, second.keys[q.id], 'wrong');
  await press(page, 'submit', 'Enter');
  await page.waitForSelector('#verdict');
  check((await text(page, '#verdict')).startsWith('Reprovado com 0% (0 de 5)'), 'tudo errado (na questão em 2 etapas, a resposta errada) reprova com 0, mesmo com o meio ponto', await text(page, '#verdict'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('wait')?.textContent ?? '').includes('tente de novo em'));
  const wait = await text(page, '#wait');
  check(/tente de novo em \d+ (min|s)/.test(wait) && (await page.$eval('#start', (b) => b.disabled)), 'a página diz quanto falta da espera, e o botão fica desligado', wait);

  const phone = await openPage({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await press(phone, 'start', 'Enter');
  await phone.waitForSelector('dialog[open] fieldset');
  const fits = await phone.evaluate(() => {
    const d = document.querySelector('dialog').getBoundingClientRect();
    return d.left >= 0 && d.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
  });
  check(fits, 'num celular (390 px), a janela do quiz cabe na largura da tela');

  check(errors.length === 0, 'nenhum erro na página', errors.join(' | '));
  check(foreign.length === 0, 'nenhum pedido a outra origem', foreign.join(' | '));
} catch (e) {
  check(false, 'o e2e terminou sem exceção', String(e));
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
