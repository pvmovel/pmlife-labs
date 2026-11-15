// Domain: o Co-Pilot da demo responde por palavra-chave (src/Content/copilot.json). No produto, a resposta vem do
// gateway de IA; aqui, o que importa é provar que a janela abre pela tecla C, com o foco na pergunta, e responde.

export interface CopilotAnswer {
  readonly keywords: readonly string[];
  readonly answerKey: string;
}

/** Minúsculas e sem acento, para "Câmera" achar "camera". */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function toCopilotAnswers(raw: unknown): CopilotAnswer[] {
  const c = raw as { answers?: unknown };
  if (!Array.isArray(c.answers)) throw new Error('copilot: answers precisa ser uma lista');
  return c.answers.map((a: Record<string, unknown>, i: number) => {
    if (typeof a.answerKey !== 'string' || !Array.isArray(a.keywords) || a.keywords.length === 0 || !a.keywords.every((k) => typeof k === 'string' && k)) {
      throw new Error(`copilot: a resposta ${i} precisa de answerKey e keywords`);
    }
    return { answerKey: a.answerKey, keywords: a.keywords.map((k: string) => normalize(k)) };
  });
}

/** A chave da resposta para a pergunta (a primeira que casar), ou null. */
export function answerFor(question: string, answers: readonly CopilotAnswer[]): string | null {
  const words = normalize(question).split(/[^a-z0-9]+/).filter(Boolean);
  return answers.find((a) => a.keywords.some((k) => words.includes(k)))?.answerKey ?? null;
}
