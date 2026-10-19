// Textos da demo (o produto usa o i18n tipado; aqui a demo é só em português).
import type { AiErrorCode } from '../Application/AskTutor';

export const TEXTS = {
  back: '← PMLife Labs',
  docs: 'Documentação',
  eyebrow: 'Spike · IA a custo zero',
  title: 'Um tutor de IA que responde com o material do curso',
  lead: 'A pergunta passa por uma busca no material (BM25, no navegador). Os trechos achados vão para um gateway PHP, que guarda o prompt no servidor, limita o uso por IP e troca de provedor se um cair (Gemini ➔ Groq).',
  widgetTitle: 'Tutor do Clube de Astronomia',
  label: 'Sua pergunta',
  placeholder: 'Ex.: Quando acontece o eclipse lunar?',
  examples: 'Experimente:',
  ask: 'Perguntar',
  asking: 'Pensando…',
  answerTitle: 'Resposta',
  aiNotice: 'Resposta gerada por IA a partir do material do curso. Pode conter erros: confira nos trechos abaixo.',
  by: 'Respondida por',
  sources: 'Trechos do material usados',
  noSources: 'Nenhum trecho do material combinou com a pergunta; o tutor vai dizer que o curso não cobre esse ponto.',
  errors: {
    INVALID_REQUEST: 'A pergunta está vazia ou longa demais.',
    RATE_LIMITED: 'Muitas perguntas seguidas. Espere um minuto e tente de novo.',
    AI_UNAVAILABLE: 'O tutor está indisponível agora (a cota gratuita pode ter acabado). Tente mais tarde.',
    NETWORK_ERROR: 'Sem conexão com o servidor.',
    INVALID_RESPONSE: 'O servidor respondeu algo inesperado.',
  } satisfies Record<AiErrorCode, string>,
} as const;

export const EXAMPLES = ['Quando acontece o eclipse lunar?', 'Qual o melhor primeiro instrumento?', 'Como ganho o certificado?'];
