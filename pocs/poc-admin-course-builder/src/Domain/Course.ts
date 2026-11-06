// Domain: o documento de um curso como o admin o monta (US49). Um recorte do documento de curso do produto (ADR-012):
// o título, a escada de níveis, as fases (com os pré-requisitos e os prédios da cidade de cada fase) e as missões de
// cada fase. A cidade e as salas são do editor do mundo (US37); aqui a fase só traz os prédios, que as missões usam.
// TypeScript puro.

/** Um texto nos dois idiomas da plataforma. */
export interface Text2 {
  readonly pt: string;
  readonly en: string;
}

/** Os pontos de atributo (o id do catálogo da instituição ➔ pontos). */
export type Points = Readonly<Record<string, number>>;

/** Um degrau da escada: o XP mínimo, os pontos de atributo e as fases concluídas que ele exige. */
export interface Level {
  readonly id: string;
  readonly label: Text2;
  readonly minXp: number;
  readonly attributes: Points;
  /** Fases que precisam estar concluídas. */
  readonly phases: readonly string[];
}

/** Um prédio da cidade da fase (o editor do mundo posiciona; aqui basta o nome). */
export interface Building {
  readonly id: string;
  readonly label: Text2;
}

/** Uma missão da fase: o prédio onde ela fica, o XP e os pontos de atributo que ela dá. */
export interface Quest {
  readonly id: string;
  readonly title: Text2;
  readonly buildingId: string;
  readonly xp: number;
  readonly attributes: Points;
}

/** Uma fase do curso: uma cidade com prédios e missões, liberada pelas fases que ela exige. */
export interface Phase {
  readonly id: string;
  readonly title: Text2;
  /** Fases que precisam estar concluídas antes. */
  readonly requires: readonly string[];
  readonly buildings: readonly Building[];
  readonly quests: readonly Quest[];
}

/** O curso. */
export interface Course {
  /** `<instituição>.<nome curto>` (o formato dos cursos de uma instituição). */
  readonly courseId: string;
  readonly title: Text2;
  /** Os atributos que o curso usa (do catálogo da instituição). */
  readonly attributes: readonly string[];
  readonly levels: readonly Level[];
  readonly phases: readonly Phase[];
}

/** O formato do nome curto do curso (o mesmo do produto: `a-z 0-9 -`, de 2 a 19, começando por letra). */
export const COURSE_SLUG = /^[a-z][a-z0-9-]{1,18}$/;

/** O id do curso de uma instituição. */
export const courseIdOf = (tenant: string, slug: string): string => `${tenant}.${slug}`;
