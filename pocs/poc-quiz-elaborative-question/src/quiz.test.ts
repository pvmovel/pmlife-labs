// A nota e a regra das tentativas em TypeScript, com os mesmos casos de cases/ que o PHP roda, e o que a tela decide
// sozinha (public/quiz-view.v1.js). Node 24, sem dependência: node --no-warnings --test src/quiz.test.ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { attemptGate, isPassing, QUESTION_KINDS, scoreOf, twoStepCredit } from './quiz.ts';
import { answeredCount, clozeParts, firstStepDone, formatPoints, formatWait, isAnswered, moveItem } from '../public/quiz-view.v1.js';

const dir = new URL('../cases/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const c = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  test(`${file}: ${c.description}`, () => {
    const got =
      c.type === 'score'
        ? { score: scoreOf(c.points, c.total), passed: isPassing(c.points, c.total, c.passPercent) }
        : c.type === 'credit'
          ? twoStepCredit(c.answerRight, c.reasonRight, c.halfCredit)
          : attemptGate(c.attempts, c.policy, c.now);
    assert.deepEqual(got, c.expect);
  });
}

test('os 5 formatos da US58 e a questão em 2 etapas (US59)', () => {
  assert.deepEqual([...QUESTION_KINDS], ['single', 'multiple', 'truefalse', 'cloze', 'ordering', 'twostep']);
});

test('a questão em 2 etapas: o porquê aparece quando a 1ª etapa tem resposta, e ela só conta com as duas', () => {
  const single = { id: 1, kind: 'twostep', first: 'single' };
  const tf = { id: 2, kind: 'twostep', first: 'truefalse' };
  assert.equal(firstStepDone(single, undefined), false);
  assert.equal(firstStepDone(single, { reason: 'r1' }), false, 'o porquê sozinho não abre nada');
  assert.equal(firstStepDone(single, { option: 'b' }), true);
  assert.equal(firstStepDone(tf, { value: false }), true, '"Falso" é uma resposta');
  assert.equal(firstStepDone(tf, { option: 'b' }), false, 'a resposta precisa ser do formato da 1ª etapa');
  assert.equal(isAnswered(single, { option: 'b' }), false, 'sem o porquê, a questão não está respondida');
  assert.equal(isAnswered(single, { option: 'b', reason: 'r2' }), true);
  assert.equal(isAnswered(tf, { value: true, reason: 'r1' }), true);
  assert.equal(answeredCount([single, tf], { 1: { option: 'a', reason: 'r1' }, 2: { value: true } }), 1);
});

test('os pontos com o meio ponto, na vírgula', () => {
  assert.equal(formatPoints(4), '4');
  assert.equal(formatPoints(4.5), '4,5');
  assert.equal(formatPoints(0.5), '0,5');
});

test('a nota com meio ponto é exata (sem erro de ponto flutuante)', () => {
  for (let total = 1; total <= 20; total++) {
    for (let halves = 0; halves <= total * 2; halves++) {
      const points = halves / 2;
      assert.equal(isPassing(points, total, 70), halves * 100 >= 70 * total * 2, `${points} de ${total}`);
      assert.equal(scoreOf(points, total), Math.floor((halves * 100) / (total * 2)));
    }
  }
});

test('ordenação pelo teclado: mover um item sobe ou desce uma posição, sem passar das pontas', () => {
  const order = ['me', 've', 'te', 'ma'];
  assert.deepEqual(moveItem(order, 2, -1), ['me', 'te', 've', 'ma']);
  assert.deepEqual(moveItem(order, 0, 1), ['ve', 'me', 'te', 'ma']);
  assert.deepEqual(moveItem(order, 0, -1), order);
  assert.deepEqual(moveItem(order, 3, 1), order);
  assert.deepEqual(order, ['me', 've', 'te', 'ma'], 'a lista de antes não muda');
});

test('o botão Enviar só liga com todas respondidas (a ordenação já começa respondida)', () => {
  const qs = [
    { id: 1, kind: 'single' },
    { id: 2, kind: 'multiple' },
    { id: 3, kind: 'truefalse' },
    { id: 4, kind: 'cloze', blanks: [{ key: '1' }, { key: '2' }] },
    { id: 5, kind: 'ordering' },
  ];
  assert.equal(answeredCount(qs, {}), 1);
  const all = { 1: { option: 'a' }, 2: { options: ['a'] }, 3: { value: false }, 4: { blanks: { 1: 'x', 2: 'y' } } };
  assert.equal(answeredCount(qs, all), 5);
  assert.equal(isAnswered(qs[1], { options: [] }), false, 'múltipla sem nenhuma marcada não conta');
  assert.equal(isAnswered(qs[3], { blanks: { 1: 'x', 2: '' } }), false, 'lacuna em branco não conta');
  assert.equal(isAnswered(qs[2], { value: false }), true, '"Falso" é uma resposta');
});

test('as lacunas: o texto e, no lugar de {n}, a lacuna', () => {
  assert.deepEqual(clozeParts('O Sol é uma {1} e a Terra é o {2} planeta.'), [{ text: 'O Sol é uma ' }, { blank: '1' }, { text: ' e a Terra é o ' }, { blank: '2' }, { text: ' planeta.' }]);
  assert.deepEqual(clozeParts('{1}'), [{ blank: '1' }]);
});

test('quanto falta da espera, por extenso curto', () => {
  assert.equal(formatWait(540), '9 min 00 s');
  assert.equal(formatWait(545.2), '9 min 06 s');
  assert.equal(formatWait(45), '45 s');
  assert.equal(formatWait(-3), '0 s');
});
