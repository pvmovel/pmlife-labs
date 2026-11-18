// A demo do quiz: a mesma API do produto ({status, data}), com o token CSRF da sessão em todo POST. A tela só mostra
// o que o servidor manda: as questões sem gabarito e, depois de enviar, certo ou errado e a justificativa.
// US59: a questão em 2 etapas mostra a 1ª (a resposta) e, assim que ela tem resposta, a 2ª (o porquê), na mesma tela
// e sem perguntar ao servidor; a devolutiva diz cada etapa e o meio ponto.
// 100% pelo teclado: controles nativos (rádio, caixa, lista) e, na ordenação, Alt+↑/↓ no item (ou os botões ↑ e ↓),
// com o anúncio da posição nova para o leitor de tela. O mouse e o toque continuam funcionando.
import { answeredCount, clozeParts, firstStepDone, formatPoints, formatWait, isAnswered, moveItem } from './quiz-view.v1.js';

const API = './quiz.php';
const $ = (id) => document.getElementById(id);
const dialog = $('quiz');
const body = $('dialog-body');
let csrf = '';
let state = null;
let attempt = null;
let answers = {};
let waitTimer = 0;

const el = (tag, { dataset, ...props } = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.dataset, dataset ?? {});
  for (const c of children) node.append(c);
  return node;
};
const announce = (text) => {
  $('announce').textContent = '';
  requestAnimationFrame(() => ($('announce').textContent = text));
};

async function api(method, payload) {
  const res = await fetch(API, {
    method,
    credentials: 'same-origin',
    headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error('SERVER_ERROR');
  return json;
}

async function load() {
  const r = await api('GET');
  if (r.status !== 'success') return showError(r.error?.code);
  state = r.data;
  csrf = state.csrf;
  render();
}

function render() {
  const q = state.quiz;
  $('quiz-title').textContent = q.title;
  const attempts = state.attempts.filter((a) => a.submitted).length;
  $('stats').replaceChildren(
    el('span', {}, 'Sorteio: ', el('b', { textContent: `${q.drawCount} de ${q.bank}` })),
    el('span', {}, 'Nota de corte: ', el('b', { textContent: `${q.passPercent}%` })),
    el('span', {}, 'Tentativas: ', el('b', { textContent: q.maxAttempts === null ? `${attempts} (sem limite)` : `${attempts} de ${q.maxAttempts}` })),
    el('span', {}, 'Melhor nota: ', el('b', { textContent: state.best === null ? '—' : `${state.best}%` })),
    el('span', {}, 'XP: ', el('b', { textContent: String(state.xp), id: 'xp' })),
  );
  const g = state.gate;
  const start = $('start');
  start.textContent = g.reason === 'open' ? 'Continuar o quiz' : g.passed ? 'Refazer (sem XP)' : 'Começar o quiz';
  start.disabled = !g.canStart;
  clearInterval(waitTimer);
  $('wait').textContent = '';
  if (g.reason === 'cooldown') countdown(g.waitSeconds);
  if (g.reason === 'exhausted') $('wait').textContent = 'Você usou todas as tentativas.';
}

function countdown(seconds) {
  const until = Date.now() + seconds * 1000;
  const tick = () => {
    const left = (until - Date.now()) / 1000;
    if (left <= 0) {
      clearInterval(waitTimer);
      void load();
      return;
    }
    $('wait').textContent = `Reprovado: tente de novo em ${formatWait(left)}.`;
  };
  tick();
  waitTimer = setInterval(tick, 1000);
}

function showError(code) {
  const text = {
    QUIZ_COOLDOWN: 'Ainda na espera depois da última tentativa.',
    QUIZ_NO_ATTEMPTS: 'Você usou todas as tentativas.',
    CSRF_INVALID: 'A sessão mudou: recarregue a página.',
    ATTEMPT_CLOSED: 'Esta tentativa já foi enviada.',
  }[code] ?? 'Algo deu errado no servidor. Tente de novo.';
  $('error').textContent = text;
}

$('start').addEventListener('click', async () => {
  $('error').textContent = '';
  const r = await api('POST', { action: 'start' });
  if (r.status !== 'success') {
    showError(r.error?.code);
    return load();
  }
  attempt = r.data;
  answers = {};
  for (const q of attempt.questions) if (q.kind === 'ordering') answers[String(q.id)] = { order: q.items.map((i) => i.id) };
  renderQuestions();
  dialog.showModal();
  body.querySelector('input, select, button')?.focus();
});

$('close').addEventListener('click', () => dialog.close());
// Fechar no meio não perde nada: a tentativa fica aberta no servidor e "Continuar" traz as mesmas questões.
dialog.addEventListener('close', () => void load());

function renderQuestions() {
  $('dialog-title').textContent = `${state.quiz.title}: ${attempt.questions.length} questões`;
  const form = el('form', { noValidate: true });
  attempt.questions.forEach((q, i) => form.append(question(q, i)));
  const progress = el('span', { className: 'muted', id: 'progress', role: 'status' });
  const submit = el('button', { type: 'submit', className: 'primary', id: 'submit', textContent: 'Enviar respostas' });
  form.append(el('div', { className: 'actions' }, submit, progress));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void send();
  });
  body.replaceChildren(form);
  refreshProgress();
}

function refreshProgress() {
  const n = answeredCount(attempt.questions, answers);
  const total = attempt.questions.length;
  $('progress').textContent = `Respondidas: ${n} de ${total}`;
  $('submit').disabled = n < total;
}

function setAnswer(q, value) {
  answers[String(q.id)] = value;
  refreshProgress();
}

function question(q, i) {
  const fs = el('fieldset', { id: `q-${q.id}`, dataset: { kind: q.kind } });
  fs.append(el('legend', { textContent: `${i + 1}. ${q.prompt}` }));
  const name = `q${q.id}`;
  if (q.kind === 'single' || q.kind === 'multiple') {
    if (q.kind === 'multiple') fs.append(el('p', { className: 'hint', textContent: 'Marque todas as certas.' }));
    for (const o of q.options) {
      const input = el('input', { type: q.kind === 'single' ? 'radio' : 'checkbox', name, value: o.id, id: `${name}-${o.id}` });
      input.addEventListener('change', () => {
        const picked = [...fs.querySelectorAll('input:checked')].map((x) => x.value);
        setAnswer(q, q.kind === 'single' ? { option: picked[0] } : { options: picked });
      });
      fs.append(el('label', { className: 'choice' }, input, o.text));
    }
  } else if (q.kind === 'truefalse') {
    for (const [value, text] of [[true, 'Verdadeiro'], [false, 'Falso']]) {
      const input = el('input', { type: 'radio', name, value: String(value), id: `${name}-${value}` });
      input.addEventListener('change', () => setAnswer(q, { value }));
      fs.append(el('label', { className: 'choice' }, input, text));
    }
  } else if (q.kind === 'cloze') {
    const p = el('p', { className: 'cloze' });
    const picks = {};
    for (const part of clozeParts(q.text)) {
      if ('text' in part) {
        p.append(part.text);
        continue;
      }
      const blank = q.blanks.find((b) => b.key === part.blank);
      const select = el('select', { id: `${name}-b${part.blank}`, ariaLabel: `Lacuna ${part.blank}` }, el('option', { value: '', textContent: '— escolha —' }));
      for (const c of blank.choices) select.append(el('option', { value: c, textContent: c }));
      select.addEventListener('change', () => {
        picks[part.blank] = select.value;
        setAnswer(q, { blanks: { ...picks } });
      });
      p.append(select);
    }
    fs.append(p);
  } else if (q.kind === 'twostep') {
    twoStep(q, fs, name);
  } else if (q.kind === 'ordering') {
    fs.append(el('p', { className: 'hint', id: `${name}-hint` }, 'No item, ', el('kbd', { textContent: 'Alt' }), ' + ', el('kbd', { textContent: '↑' }), ' ou ', el('kbd', { textContent: '↓' }), ' muda a posição (ou use os botões).'));
    fs.append(el('ol', { className: 'order', id: `${name}-list` }));
    drawOrder(q, fs);
  }
  return fs;
}

/**
 * A questão em 2 etapas: a 1ª é a resposta (escolha única ou verdadeiro ou falso); a 2ª, o porquê, aparece logo abaixo
 * quando a 1ª tem resposta, e o leitor de tela ouve o aviso. Os dois grupos são rádios nativos: setas escolhem dentro
 * do grupo e Tab passa para o próximo, então o teclado basta. Trocar a resposta depois não esconde o porquê.
 */
function twoStep(q, fs, name) {
  fs.dataset.first = q.first;
  fs.dataset.half = String(q.halfCredit);
  fs.append(
    el('p', {
      className: 'hint',
      textContent: q.halfCredit
        ? 'Vale 1 ponto com a resposta e o porquê certos; só a resposta certa vale meio ponto.'
        : 'Vale 1 ponto só com a resposta e o porquê certos.',
    }),
  );
  const step1 = el('fieldset', { className: 'step', id: `${name}-s1` }, el('legend', { textContent: '1ª etapa: a resposta' }));
  const step2 = el('fieldset', { className: 'step', id: `${name}-s2`, hidden: true }, el('legend', { textContent: `2ª etapa: ${q.reasonPrompt}` }));
  const pick = {};
  const update = () => {
    setAnswer(q, { ...pick });
    if (step2.hidden && firstStepDone(q, pick)) {
      step2.hidden = false;
      announce('Agora escolha o porquê, logo abaixo.');
    }
  };
  const choices = q.first === 'single' ? q.options.map((o) => [o.id, o.text]) : [[true, 'Verdadeiro'], [false, 'Falso']];
  for (const [value, text] of choices) {
    const input = el('input', { type: 'radio', name, value: String(value), id: `${name}-${value}` });
    input.addEventListener('change', () => {
      if (q.first === 'single') pick.option = value;
      else pick.value = value;
      update();
    });
    step1.append(el('label', { className: 'choice' }, input, text));
  }
  for (const r of q.reasons) {
    const input = el('input', { type: 'radio', name: `${name}r`, value: r.id, id: `${name}-r-${r.id}` });
    input.addEventListener('change', () => {
      pick.reason = r.id;
      update();
    });
    step2.append(el('label', { className: 'choice' }, input, r.text));
  }
  fs.append(step1, step2);
}

function drawOrder(q, fs, focusId) {
  const name = `q${q.id}`;
  const order = answers[String(q.id)].order;
  const byId = Object.fromEntries(q.items.map((i) => [i.id, i.text]));
  const list = fs.querySelector('ol');
  const move = (index, delta) => {
    const next = moveItem(order, index, delta);
    if (next.join() === order.join()) return;
    setAnswer(q, { order: next });
    const id = order[index];
    drawOrder(q, fs, id);
    announce(`${byId[id]}: posição ${next.indexOf(id) + 1} de ${next.length}.`);
  };
  list.replaceChildren(
    ...order.map((id, index) => {
      const li = el('li', { tabIndex: 0, id: `${name}-${id}`, dataset: { id } });
      li.setAttribute('aria-describedby', `${name}-hint`);
      li.setAttribute('aria-label', `${byId[id]}, posição ${index + 1} de ${order.length}`);
      li.addEventListener('keydown', (e) => {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        move(index, e.key === 'ArrowUp' ? -1 : 1);
      });
      const up = el('button', { type: 'button', textContent: '↑', ariaLabel: `Subir ${byId[id]}`, disabled: index === 0 });
      const down = el('button', { type: 'button', textContent: '↓', ariaLabel: `Descer ${byId[id]}`, disabled: index === order.length - 1 });
      up.addEventListener('click', () => move(index, -1));
      down.addEventListener('click', () => move(index, 1));
      li.append(el('span', { className: 'pos', textContent: `${index + 1}.` }), el('span', { className: 'label', textContent: byId[id] }), up, down);
      return li;
    }),
  );
  if (focusId) list.querySelector(`[data-id="${focusId}"]`)?.focus();
}

async function send() {
  const missing = attempt.questions.find((q) => !isAnswered(q, answers[String(q.id)]));
  if (missing) return;
  $('submit').disabled = true;
  const r = await api('POST', { action: 'submit', attemptId: attempt.attemptId, answers });
  if (r.status !== 'success') {
    showError(r.error?.code);
    dialog.close();
    return;
  }
  showResult(r.data);
}

function showResult(d) {
  const byId = Object.fromEntries(attempt.questions.map((q, i) => [q.id, `${i + 1}. ${q.prompt}`]));
  const verdict = d.passed ? `Aprovado com ${d.score}%` : `Reprovado com ${d.score}%`;
  const xp = d.xp > 0 ? ` +${d.xp} XP.` : d.passed ? ' Sem XP: ele vem só na primeira aprovação.' : '';
  const head = el('h3', { id: 'verdict', className: d.passed ? 'result-ok' : 'result-bad', tabIndex: -1, textContent: `${verdict} (${formatPoints(d.points)} de ${d.total}).${xp}` });
  const mark = (x) => (x.correct ? ['✓ Certo: ', 'result-ok'] : x.credit === 0.5 ? ['½ Meio ponto: ', 'result-half'] : ['✗ Errado: ', 'result-bad']);
  const list = el(
    'ul',
    { className: 'results' },
    ...d.results.map((x) =>
      el(
        'li',
        { dataset: { correct: String(x.correct), credit: String(x.credit) }, id: `r-${x.id}` },
        el('strong', { className: mark(x)[1], textContent: mark(x)[0] }),
        byId[x.id],
        // US59: na questão em 2 etapas, o acerto de cada etapa (sem dizer qual era a certa) e a explicação do porquê.
        ...(x.steps ? [el('p', { className: 'steps', textContent: `Resposta: ${x.steps.answer ? 'certa' : 'errada'} · Porquê: ${x.steps.reason ? 'certo' : 'errado'}` })] : []),
        ...(x.rationale ? [el('p', { className: 'hint', textContent: x.steps ? `Explicação: ${x.rationale}` : x.rationale })] : []),
      ),
    ),
  );
  const done = el('button', { type: 'button', className: 'primary', textContent: 'Voltar' });
  done.addEventListener('click', () => dialog.close());
  body.replaceChildren(head, el('p', { className: 'muted', textContent: 'A resposta certa das que você errou não aparece: a próxima tentativa sorteia outras questões.' }), list, el('div', { className: 'actions' }, done));
  head.focus();
}

load().catch(() => showError());
