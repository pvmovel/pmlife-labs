// O que a tela do quiz decide sozinha, sem o servidor (funções puras, testadas em src/quiz.test.ts): mover um item na
// ordenação, saber se uma questão está respondida, quando mostrar o porquê da questão em 2 etapas (US59), ler as
// lacunas do texto, escrever os pontos com meio ponto e quanto falta da espera.
// O nome tem a versão (.v1) porque o Cloudflare guarda arquivos estáticos por 4 h: a versão nova muda o nome.

/**
 * Move o item da posição `index` em `delta` (-1 sobe, +1 desce), sem passar das pontas.
 * @param {readonly string[]} order
 * @param {number} index
 * @param {number} delta
 * @returns {string[]}
 */
export function moveItem(order, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= order.length || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * A questão tem resposta? (a ordenação sempre tem: a ordem atual é a resposta).
 * @param {{kind: string, blanks?: {key: string}[]}} question
 * @param {any} answer
 */
export function isAnswered(question, answer) {
  if (answer === undefined || answer === null) return question.kind === 'ordering';
  switch (question.kind) {
    case 'single':
      return typeof answer.option === 'string';
    case 'multiple':
      return Array.isArray(answer.options) && answer.options.length > 0;
    case 'truefalse':
      return typeof answer.value === 'boolean';
    case 'cloze':
      return (question.blanks ?? []).every((b) => typeof answer.blanks?.[b.key] === 'string' && answer.blanks[b.key] !== '');
    case 'ordering':
      return true;
    case 'twostep':
      return firstStepDone(question, answer) && typeof answer.reason === 'string';
    default:
      return false;
  }
}

/**
 * A 1ª etapa da questão em 2 etapas tem resposta? A partir daí a tela mostra o porquê (decisão do Pablo, 2026-11-18:
 * na mesma tela, sem perguntar ao servidor; a correção das duas etapas vem só no envio).
 * @param {{first: 'single' | 'truefalse'}} question
 * @param {any} answer
 */
export function firstStepDone(question, answer) {
  if (!answer) return false;
  return question.first === 'single' ? typeof answer.option === 'string' : typeof answer.value === 'boolean';
}

/**
 * Os pontos por extenso, com a vírgula do meio ponto: 4 ➔ "4", 4.5 ➔ "4,5".
 * @param {number} points
 */
export const formatPoints = (points) => (Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.', ','));

/**
 * Quantas questões já têm resposta.
 * @param {readonly any[]} questions
 * @param {Record<string, any>} answers
 */
export const answeredCount = (questions, answers) => questions.filter((q) => isAnswered(q, answers[String(q.id)])).length;

/**
 * O texto das lacunas em pedaços: o texto e, no lugar de "{1}", a lacuna 1.
 * @param {string} text
 * @returns {({text: string} | {blank: string})[]}
 */
export function clozeParts(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\d+)\}/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ blank: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * Quanto falta, por extenso curto: "9 min 05 s", "45 s".
 * @param {number} seconds
 */
export function formatWait(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return min > 0 ? `${min} min ${String(rest).padStart(2, '0')} s` : `${rest} s`;
}
