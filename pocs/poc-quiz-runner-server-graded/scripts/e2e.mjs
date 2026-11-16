// Prova no Chrome headless, com o PHP e o MySQL de verdade, que o quiz se faz SÓ pelo teclado (sem nenhum clique):
//   1. Tab até "Começar o quiz" e Enter: a janela abre com as 5 questões sorteadas;
//   2. cada formato respondido pelo teclado: Espaço no rádio e na caixa, setas na lista das lacunas e Alt+↑ na ordenação
//      (com o anúncio da posição nova para o leitor de tela);
//   3. 4 de 5 certas e Enter em "Enviar": aprovado com 80%, +100 XP, certo/errado e as justificativas;
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
  const port = 4199;
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

/** Responde uma questão pelo teclado: a resposta certa, ou uma errada. */
async function answer(page, q, key, right) {
  const name = `q${q.id}`;
  if (q.kind === 'single') {
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
  const qs = await page.$$eval('fieldset[id^="q-"]', (fss) =>
    fss.map((fs) => ({ id: Number(fs.id.slice(2)), kind: fs.dataset.kind, options: [...fs.querySelectorAll('input')].map((i) => i.value) })),
  );
  const keys = await (await fetch(`${BASE}/__e2e/answers?ids=${qs.map((q) => q.id).join(',')}`)).json();
  return { qs, keys };
}

try {
  // Cada sessão nova é um aluno novo com um sorteio novo: abre até sair uma prova com ordenação (60% de chance cada),
  // para o Alt+↑ ser sempre testado. As tentativas das outras sessões só ficam abertas.
  let page = null;
  let tries = 0;
  for (; tries < 12; tries++) {
    page = await openPage({ width: 1280, height: 900 });
    if (tries === 0) {
      check((await text(page, '#quiz-title')) === 'Astronomia básica', 'a página abre com o quiz de exemplo');
      check(await tabTo(page, 'start'), 'Tab leva ao botão "Começar o quiz"');
    } else {
      await page.$eval('#start', (n) => n.focus());
    }
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open] fieldset');
    if ((await page.$$('fieldset[data-kind="ordering"]')).length > 0) break;
    await page.browserContext().close();
  }
  const { qs, keys } = await questionsOf(page);
  // A ordenação vai por último, para ser a errada (a ordem invertida): o teste confere o Alt+↑ de verdade.
  qs.sort((a, b) => Number(a.kind === 'ordering') - Number(b.kind === 'ordering'));
  check(qs.length === 5 && (await page.evaluate(() => document.activeElement?.closest('dialog') !== null)), 'Enter abre a janela com as 5 questões sorteadas e o foco dentro dela');
  check((await page.$eval('#submit', (b) => b.disabled)) && (await text(page, '#progress')).includes('de 5'), 'o "Enviar" fica desligado até tudo estar respondido');

  for (const [i, q] of qs.entries()) await answer(page, q, keys[q.id], i < qs.length - 1);
  const ordering = qs.find((q) => q.kind === 'ordering');
  if (ordering) {
    const now = await page.$$eval(`#q${ordering.id}-list li`, (lis) => lis.map((li) => li.dataset.id));
    check(now.join() === (ordering === qs.at(-1) ? [...keys[ordering.id].order].reverse() : keys[ordering.id].order).join(), 'a ordenação muda só com Alt+↑, no teclado');
    check((await page.$eval('#announce', (n) => n.textContent ?? '')).includes('posição'), 'o leitor de tela ouve a posição nova do item', await page.$eval('#announce', (n) => n.textContent ?? ''));
  } else {
    check(false, `nenhuma prova com ordenação em ${tries} sorteios`);
  }
  check((await text(page, '#progress')) === 'Respondidas: 5 de 5' && !(await page.$eval('#submit', (b) => b.disabled)), 'com as 5 respondidas pelo teclado, o "Enviar" liga');
  await press(page, 'submit', 'Enter');
  await page.waitForSelector('#verdict');
  const verdict = await text(page, '#verdict');
  check(verdict.startsWith('Aprovado com 80%') && verdict.includes('+100 XP') && (await active(page)) === 'verdict', 'Enter envia: aprovado com 80% e +100 XP, com o foco no resultado', verdict);
  const marks = await page.$$eval('ul.results li', (lis) => lis.map((li) => li.dataset.correct));
  check(marks.filter((m) => m === 'true').length === 4 && marks.length === 5, 'a devolutiva marca certo ou errado em cada questão (4 certas)');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.waitForFunction(() => document.getElementById('xp')?.textContent === '100');
  check((await text(page, '#start')) === 'Refazer (sem XP)', 'Esc fecha; o XP fica em 100 e o botão vira "Refazer (sem XP)"');

  await press(page, 'start', 'Enter');
  await page.waitForSelector('dialog[open] fieldset');
  const second = await questionsOf(page);
  for (const q of second.qs) await answer(page, q, second.keys[q.id], false);
  await press(page, 'submit', 'Enter');
  await page.waitForSelector('#verdict');
  check((await text(page, '#verdict')).startsWith('Reprovado'), 'tudo errado reprova', await text(page, '#verdict'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('wait')?.textContent ?? '').includes('tente de novo em'));
  const wait = await text(page, '#wait');
  check(/tente de novo em (9|10) min/.test(wait) && (await page.$eval('#start', (b) => b.disabled)), 'Gherkin "Espera entre tentativas": a página diz quanto falta, e o botão fica desligado', wait);

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
