// O Markdown do aviso vira HTML seguro (marked + DOMPurify), no jsdom: os ataques comuns saem, o Markdown fica.
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import { makeRenderer } from '../public/markdown.v1.js';

const { window } = new JSDOM('');
const render = makeRenderer(marked, createDOMPurify(window));
let failed = false;
let total = 0;
const check = (ok, label) => {
  total++;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed = true;
};
const doc = (html) => new JSDOM(`<body>${html}</body>`).window.document;

console.log('== O Markdown higienizado (marked + DOMPurify, sem banco) ==');
const md = render('# Prova\n\n**Atenção:** a prova é na *sexta*.\n\n- sala 3\n- 14h\n\n[Calendário](https://exemplo.test/cal)');
const d = doc(md);
check(d.querySelector('h1')?.textContent === 'Prova' && d.querySelector('strong') && d.querySelector('em') && d.querySelectorAll('li').length === 2, 'o Markdown fica: título, negrito, itálico e lista');
const a = d.querySelector('a');
check(a?.getAttribute('target') === '_blank' && a?.getAttribute('rel') === 'noopener noreferrer', 'o link para fora abre em outra aba, com noopener noreferrer');

const attacks = {
  'script embutido': '<script>alert(1)</script>oi',
  'onerror numa imagem': '<img src="x" onerror="alert(1)">',
  'link javascript: em Markdown': '[clique](javascript:alert(1))',
  'link javascript: em HTML': '<a href="javascript:alert(1)">clique</a>',
  'onclick num link': '<a href="https://exemplo.test" onclick="alert(1)">ok</a>',
  'iframe': '<iframe src="https://exemplo.test"></iframe>',
  'style e formulário': '<style>body{display:none}</style><form action="https://exemplo.test"><input name="senha"></form>',
  'svg com onload': '<svg onload="alert(1)"><circle r="1"/></svg>',
};
for (const [label, input] of Object.entries(attacks)) {
  const html = render(input).toLowerCase();
  check(!/<script|onerror|onclick|onload|javascript:|<iframe|<style|<form|<input/.test(html), `${label}: removido`);
}

const big = render(('Parágrafo com **negrito** e um [link](https://exemplo.test).\n\n').repeat(300));
const t0 = performance.now();
for (let i = 0; i < 20; i++) render(('Parágrafo com **negrito** e um [link](https://exemplo.test).\n\n').repeat(300));
const ms = (performance.now() - t0) / 20;
check(big.length > 0 && ms < 200, `um aviso grande (~20 mil caracteres) vira HTML seguro em ${ms.toFixed(1)} ms`);

console.log(`\n${failed ? `❌ falhou (${total} verificações)` : `✅ ${total} verificações verdes`}\n`);
process.exit(failed ? 1 : 0);
