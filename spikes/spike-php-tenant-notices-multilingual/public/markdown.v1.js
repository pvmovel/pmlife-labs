// Markdown ➔ HTML seguro, o mesmo no navegador (demo, com marked e DOMPurify do CDN) e no Node (teste, com o jsdom).
// O aviso fica cru no banco; o HTML só nasce aqui, sempre higienizado: sem script, on*, javascript:, iframe nem style.
// Link para fora abre em outra aba, sem dar ao site de destino acesso a esta página (noopener noreferrer).
// O nome tem a versão (.v1): a CDN na frente do domínio guarda arquivos estáticos por horas, e uma mudança aqui vira
// markdown.v2.js, com o import da demo atualizado junto.

/**
 * @param {{ parse: (md: string, o: { async: false }) => string }} marked
 * @param {{ sanitize: (html: string, o?: object) => string, addHook: Function }} DOMPurify
 * @returns {(markdown: string) => string}
 */
export function makeRenderer(marked, DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return (markdown) =>
    DOMPurify.sanitize(marked.parse(markdown, { async: false }), { FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
}
