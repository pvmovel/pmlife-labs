// Domain: o tamanho das turmas e a turma de quem se matricula agora (US48). TypeScript puro, espelhado em
// php/src/CohortCapacity.php com os mesmos casos de conformidade (cases/*.json).
//
// Regras (decisões do Pablo, 2026-11-06):
// - o limite de uma turma é um múltiplo de 4, de 4 a 48 (grupos de 2 e de 4 no futuro), com o padrão 12;
// - o master da plataforma define o teto de cada instituição; a instituição escolhe um limite até esse teto;
// - a turma fecha no que vier primeiro: lotou ou passou a data de fim; a próxima matrícula abre a turma seguinte;
// - as turmas de antes ganham o limite padrão, mas ninguém sai delas (só não recebem mais gente quando cheias);
// - a matrícula de equipe (o master) não ocupa vaga.

/** O passo do limite: grupos de 2 e de 4. */
export const COHORT_STEP = 4;
/** O menor limite. */
export const COHORT_MIN = 4;
/** O maior limite (e o maior teto). */
export const COHORT_MAX = 48;
/** O limite e o teto de quem ainda não escolheu. */
export const COHORT_DEFAULT = 12;

/** Por que um limite não vale. */
export type LimitProblem = 'COHORT_LIMIT_INVALID' | 'COHORT_LIMIT_ABOVE_CEILING';

/** Uma turma como o banco a devolve, com quantos alunos ela tem (a equipe não conta). */
export interface CohortRow {
  readonly id: number;
  readonly slug: string;
  /** Início, em UTC (`AAAA-MM-DD hh:mm:ss`). */
  readonly startsAt: string;
  /** Fim, em UTC, ou `null` (sem fim). */
  readonly endsAt: string | null;
  /** O limite gravado na turma. */
  readonly capacity: number;
  /** Alunos matriculados (ativos, sem a equipe). */
  readonly enrolled: number;
}

/** A turma de quem entra agora: uma que já existe, ou a seguinte, a criar. */
export type CohortChoice =
  | { readonly kind: 'existing'; readonly id: number; readonly slug: string }
  | { readonly kind: 'new'; readonly slug: string; readonly capacity: number };

/**
 * O limite é válido? Múltiplo de 4, de 4 a 48 e, se houver teto, até ele.
 *
 * @param limit - O limite escolhido.
 * @param ceiling - O teto da instituição (o próprio teto é conferido com `ceiling` indefinido).
 * @returns O problema, ou `null` se vale.
 */
export function limitProblem(limit: number, ceiling?: number): LimitProblem | null {
  if (!Number.isInteger(limit) || limit < COHORT_MIN || limit > COHORT_MAX || limit % COHORT_STEP !== 0) return 'COHORT_LIMIT_INVALID';
  if (ceiling !== undefined && limit > ceiling) return 'COHORT_LIMIT_ABOVE_CEILING';
  return null;
}

/**
 * As opções do seletor de limite: 4, 8, 12 … até o teto.
 *
 * @param ceiling - O teto (sem teto, até 48).
 * @returns Os limites que o admin pode escolher.
 */
export function limitOptions(ceiling: number = COHORT_MAX): number[] {
  const top = limitProblem(ceiling) === null ? ceiling : COHORT_MAX;
  const out: number[] = [];
  for (let n = COHORT_MIN; n <= top; n += COHORT_STEP) out.push(n);
  return out;
}

/** O limite que vale numa turma: o dela, mas nunca acima do teto atual da instituição. */
export const effectiveCapacity = (capacity: number, ceiling: number): number => Math.min(capacity, ceiling);

/** A turma aceita mais alguém agora? (começou, não acabou e não lotou). */
export function isOpen(c: CohortRow, now: string, ceiling: number): boolean {
  return c.startsAt <= now && (c.endsAt === null || c.endsAt > now) && c.enrolled < effectiveCapacity(c.capacity, ceiling);
}

/**
 * O nome da turma seguinte: `turma-N`, com N a partir do número de turmas mais um, pulando os nomes que já existem.
 *
 * @param slugs - Os nomes das turmas do curso.
 * @returns O nome livre.
 */
export function nextSlug(slugs: readonly string[]): string {
  const taken = new Set(slugs);
  let n = slugs.length + 1;
  while (taken.has(`turma-${n}`)) n++;
  return `turma-${n}`;
}

/**
 * A turma de quem se matricula agora (US48). Entre as abertas, a que começou por último (como na US44: a turma do
 * semestre atual vem antes da antiga); no empate, a criada primeiro. Sem turma aberta, a seguinte, com o limite do curso
 * (nunca acima do teto).
 *
 * @param cohorts - As turmas do curso, com quantos alunos cada uma tem.
 * @param now - O momento da matrícula, em UTC (`AAAA-MM-DD hh:mm:ss`).
 * @param courseLimit - O limite que a instituição escolheu para o curso.
 * @param ceiling - O teto da instituição.
 * @returns A turma escolhida, ou a seguinte, a criar.
 */
export function chooseCohort(cohorts: readonly CohortRow[], now: string, courseLimit: number, ceiling: number): CohortChoice {
  const open = cohorts.filter((c) => isOpen(c, now, ceiling)).sort((a, b) => (a.startsAt === b.startsAt ? a.id - b.id : a.startsAt < b.startsAt ? 1 : -1));
  const pick = open[0];
  if (pick) return { kind: 'existing', id: pick.id, slug: pick.slug };
  return { kind: 'new', slug: nextSlug(cohorts.map((c) => c.slug)), capacity: effectiveCapacity(courseLimit, ceiling) };
}
