// Domain da PoC da US59 (TypeScript puro, sem dependência), sobre a base da PoC da US58: o que a tela e o servidor
// precisam concordar, SEM o gabarito.
//   - os formatos de questão, como dados (o que o navegador recebe de cada um), agora com a questão em 2 etapas
//     (`twostep`): a resposta (escolha única ou verdadeiro ou falso) e o porquê, entre alternativas;
//   - a nota: tudo ou nada por questão, menos na questão em 2 etapas com meio ponto (decisão do Pablo, 2026-11-13);
//     a conta é feita em meios pontos inteiros, e a aprovação não arredonda para cima;
//   - a regra das tentativas: a tentativa aberta continua (não dá para sortear de novo até achar questões fáceis), o
//     limite de tentativas e a espera depois de reprovar.
// O php/Quiz/AttemptRules.php faz a mesma conta; os casos de cases/ provam que os dois lados dão o mesmo resultado.

/** Os formatos de questão: os 5 da US58 e a questão em 2 etapas (US59). */
export const QUESTION_KINDS = ['single', 'multiple', 'truefalse', 'cloze', 'ordering', 'twostep'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Uma alternativa ou um item, com o id estável (a resposta aponta o id, nunca a posição). */
export interface Choice {
  readonly id: string;
  readonly text: string;
}

/** Uma questão como o navegador recebe: embaralhada e sem o gabarito nem a justificativa. */
export type QuestionView =
  | { readonly id: number; readonly kind: 'single' | 'multiple'; readonly prompt: string; readonly options: readonly Choice[] }
  | { readonly id: number; readonly kind: 'truefalse'; readonly prompt: string }
  | { readonly id: number; readonly kind: 'cloze'; readonly prompt: string; readonly text: string; readonly blanks: readonly { readonly key: string; readonly choices: readonly string[] }[] }
  | { readonly id: number; readonly kind: 'ordering'; readonly prompt: string; readonly items: readonly Choice[] }
  | TwoStepView;

/**
 * A questão em 2 etapas (US59), como o navegador recebe: a 1ª etapa é a resposta (escolha única, com `options`, ou
 * verdadeiro ou falso); a 2ª, o porquê, entre `reasons`. As duas vêm juntas e embaralhadas: a tela mostra o porquê
 * logo depois da resposta, sem perguntar ao servidor (decisão do Pablo, 2026-11-18), e nada é corrigido antes do envio.
 * `halfCredit` diz se acertar só a resposta vale meio ponto (não é gabarito: o aluno sabe quanto a questão vale).
 */
export interface TwoStepView {
  readonly id: number;
  readonly kind: 'twostep';
  readonly prompt: string;
  readonly first: 'single' | 'truefalse';
  readonly options?: readonly Choice[];
  readonly reasonPrompt: string;
  readonly reasons: readonly Choice[];
  readonly halfCredit: boolean;
}

/** A resposta de uma questão, pelo formato. */
export type Answer =
  | { readonly option: string }
  | { readonly options: readonly string[] }
  | { readonly value: boolean }
  | { readonly blanks: Readonly<Record<string, string>> }
  | { readonly order: readonly string[] }
  | { readonly option: string; readonly reason: string }
  | { readonly value: boolean; readonly reason: string };

/** Quanto uma questão vale: 1 inteira, 0,5 (meio ponto) ou 0. */
export type Credit = 0 | 0.5 | 1;

/**
 * O crédito da questão em 2 etapas (US59): 1 só com as duas certas; com o meio ponto ligado pelo autor, só a resposta
 * certa vale 0,5; o porquê certo com a resposta errada não vale nada (a causa é da resposta certa).
 */
export function twoStepCredit(answerRight: boolean, reasonRight: boolean, halfCredit: boolean): Credit {
  if (answerRight && reasonRight) return 1;
  return answerRight && halfCredit ? 0.5 : 0;
}

/** Os pontos em meios pontos inteiros (4,5 ➔ 9): a conta da nota fica exata nos dois lados, sem ponto flutuante. */
const halves = (points: number): number => Math.round(points * 2);

/** A nota em porcentagem, sem casas (4 de 5 = 80; 4,5 de 5 = 90). `points` é a soma dos créditos. */
export const scoreOf = (points: number, total: number): number => (total > 0 ? Math.floor((halves(points) * 100) / (total * 2)) : 0);

/** Aprovado com a nota de corte: conta exata, sem arredondar (2 de 3 = 66,6% não passa em 67%). */
export const isPassing = (points: number, total: number, passPercent: number): boolean => total > 0 && halves(points) * 100 >= passPercent * total * 2;

/** A configuração de tentativas do quiz. */
export interface AttemptPolicy {
  /** Quantas tentativas no total; `null` = ilimitado (o padrão). */
  readonly maxAttempts: number | null;
  /** A espera depois de uma tentativa reprovada, em segundos (padrão 600). */
  readonly cooldownSeconds: number;
}

/** Uma tentativa já feita, em segundos Unix. */
export interface AttemptRecord {
  readonly startedAt: number;
  readonly submittedAt: number | null;
  readonly passed: boolean | null;
}

/** Se o aluno pode abrir o quiz agora, e por quê. */
export interface Gate {
  readonly canStart: boolean;
  /** `open`: continua a tentativa aberta; `ok`: sorteia uma nova; `cooldown`: espera; `exhausted`: acabaram as tentativas. */
  readonly reason: 'open' | 'ok' | 'cooldown' | 'exhausted';
  /** Quanto falta para poder tentar de novo, em segundos (0 fora da espera). */
  readonly waitSeconds: number;
  /** Tentativas que ainda restam; `null` = ilimitado. */
  readonly remaining: number | null;
  /** Já foi aprovado alguma vez (o XP já foi dado). */
  readonly passed: boolean;
}

/**
 * A regra das tentativas: a aberta continua; senão, acabou o limite ou a última reprovada ainda está na espera.
 *
 * @param attempts - As tentativas do aluno neste quiz, na ordem em que foram abertas (no mesmo segundo, vale a de depois).
 * @param policy - O limite e a espera.
 * @param now - Agora, em segundos Unix.
 */
export function attemptGate(attempts: readonly AttemptRecord[], policy: AttemptPolicy, now: number): Gate {
  const passed = attempts.some((a) => a.passed === true);
  const remaining = policy.maxAttempts === null ? null : Math.max(0, policy.maxAttempts - attempts.length);
  if (attempts.some((a) => a.submittedAt === null)) return { canStart: true, reason: 'open', waitSeconds: 0, remaining, passed };
  if (remaining === 0) return { canStart: false, reason: 'exhausted', waitSeconds: 0, remaining, passed };
  const last = attempts.reduce<AttemptRecord | null>((l, a) => (l === null || (a.submittedAt ?? 0) >= (l.submittedAt ?? 0) ? a : l), null);
  const until = last && last.passed === false ? (last.submittedAt ?? 0) + policy.cooldownSeconds : 0;
  if (until > now) return { canStart: false, reason: 'cooldown', waitSeconds: until - now, remaining, passed };
  return { canStart: true, reason: 'ok', waitSeconds: 0, remaining, passed };
}
