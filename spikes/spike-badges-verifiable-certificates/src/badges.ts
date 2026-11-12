// As regras puras das medalhas e da conclusão do curso (spike da US45), as mesmas de php/Badges/BadgeRules.php.
// Os dois lados rodam os casos de cases/: a tela calcula as medalhas sem perguntar ao servidor, e o servidor emite o
// certificado com a mesma regra de "curso concluído".

/** O critério de uma medalha: uma fase concluída, um atributo com pelo menos `min` pontos, ou o curso concluído. */
export type Criterion =
  | { readonly kind: 'phase'; readonly phase: string }
  | { readonly kind: 'attribute'; readonly attribute: string; readonly min: number }
  | { readonly kind: 'course' };

/** Uma medalha declarada no documento do curso. */
export interface Badge {
  readonly id: string;
  /** Chave do nome (nos textos do curso, nos dois idiomas). */
  readonly titleKey: string;
  /** Um dos {@link BADGE_ICONS}. */
  readonly icon: string;
  readonly criterion: Criterion;
}

/** O que o aluno já fez no curso: as fases concluídas e os pontos de cada atributo. */
export interface Progress {
  readonly phases: readonly string[];
  readonly attributes: Readonly<Record<string, number>>;
}

/** Os ícones que uma medalha pode usar (desenhados pela plataforma: a instituição não envia imagem). */
export const BADGE_ICONS = ['star', 'flag', 'trophy', 'book', 'rocket', 'heart'] as const;

/** Quantas medalhas um curso declara no máximo. */
export const MAX_BADGES = 30;

/** O curso está concluído quando todas as fases dele estão concluídas (decisão do Pablo, 2026-11-11). */
export function courseCompleted(phases: readonly string[], progress: Progress): boolean {
  return phases.length > 0 && phases.every((p) => progress.phases.includes(p));
}

function meets(c: Criterion, phases: readonly string[], progress: Progress): boolean {
  if (c.kind === 'phase') return progress.phases.includes(c.phase);
  if (c.kind === 'attribute') return (progress.attributes[c.attribute] ?? 0) >= c.min;
  return courseCompleted(phases, progress);
}

/** As medalhas ganhas, na ordem em que o curso as declara. */
export function earnedBadges(badges: readonly Badge[], phases: readonly string[], progress: Progress): string[] {
  return badges.filter((b) => meets(b.criterion, phases, progress)).map((b) => b.id);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

/**
 * Os problemas das medalhas de um curso (vazio: válidas), como `CÓDIGO@caminho`: o id e a chave do nome, o ícone da
 * lista, o critério que aponta para uma fase ou um atributo do curso, o mínimo de 1 a 10.000, sem id repetido e até
 * {@link MAX_BADGES}.
 */
export function badgeProblems(badges: readonly unknown[], phases: readonly string[], attributes: readonly string[]): string[] {
  const out: string[] = [];
  if (badges.length > MAX_BADGES) out.push('TOO_MANY_BADGES@/badges');
  const seen = new Set<string>();
  badges.forEach((raw, i) => {
    const at = `/badges/${i}`;
    const b = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (typeof b.id !== 'string' || !ID.test(b.id)) out.push(`BADGE_ID_INVALID@${at}/id`);
    else if (seen.has(b.id)) out.push(`BADGE_DUPLICATE@${at}/id`);
    else seen.add(b.id);
    if (typeof b.titleKey !== 'string' || b.titleKey === '') out.push(`FIELD_REQUIRED@${at}/titleKey`);
    if (!(BADGE_ICONS as readonly unknown[]).includes(b.icon)) out.push(`BADGE_ICON_INVALID@${at}/icon`);
    const c = (typeof b.criterion === 'object' && b.criterion !== null ? b.criterion : {}) as Record<string, unknown>;
    if (c.kind === 'phase') {
      if (typeof c.phase !== 'string' || !phases.includes(c.phase)) out.push(`BADGE_PHASE_UNKNOWN@${at}/criterion/phase`);
    } else if (c.kind === 'attribute') {
      if (typeof c.attribute !== 'string' || !attributes.includes(c.attribute)) out.push(`BADGE_ATTRIBUTE_UNKNOWN@${at}/criterion/attribute`);
      if (!Number.isInteger(c.min) || (c.min as number) < 1 || (c.min as number) > 10000) out.push(`BADGE_MIN_INVALID@${at}/criterion/min`);
    } else if (c.kind !== 'course') {
      out.push(`BADGE_CRITERION_INVALID@${at}/criterion`);
    }
  });
  return out;
}
