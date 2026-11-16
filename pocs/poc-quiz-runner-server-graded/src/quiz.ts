// Domain da PoC da US58 (TypeScript puro, sem dependência): o que a tela e o servidor precisam concordar, SEM o gabarito.
//   - os formatos de questão, como dados (o que o navegador recebe de cada um);
//   - a nota: tudo ou nada por questão (decisão do Pablo), em inteiros, e a aprovação sem arredondar para cima;
//   - a regra das tentativas: a tentativa aberta continua (não dá para sortear de novo até achar questões fáceis), o
//     limite de tentativas e a espera depois de reprovar.
// O php/Quiz/AttemptRules.php faz a mesma conta; os casos de cases/ provam que os dois lados dão o mesmo resultado.

/** Os formatos de questão da primeira entrega. */
export const QUESTION_KINDS = ['single', 'multiple', 'truefalse', 'cloze', 'ordering'] as const;
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
  | { readonly id: number; readonly kind: 'ordering'; readonly prompt: string; readonly items: readonly Choice[] };

/** A resposta de uma questão, pelo formato. */
export type Answer =
  | { readonly option: string }
  | { readonly options: readonly string[] }
  | { readonly value: boolean }
  | { readonly blanks: Readonly<Record<string, string>> }
  | { readonly order: readonly string[] };

/** A nota em porcentagem, sem casas (4 de 5 = 80). */
export const scoreOf = (correct: number, total: number): number => (total > 0 ? Math.floor((correct * 100) / total) : 0);

/** Aprovado com a nota de corte: conta exata, sem arredondar (2 de 3 = 66,6% não passa em 67%). */
export const isPassing = (correct: number, total: number, passPercent: number): boolean => total > 0 && correct * 100 >= passPercent * total;

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
