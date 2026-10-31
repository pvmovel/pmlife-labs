// O pedaço do documento do curso que a progressão lê (o documento inteiro, com as cidades, é o do spike da US35).
// Cada publicação é uma versão nova e imutável; o número da versão vem de onde o documento é guardado.

/** Pontos por atributo (ex.: `{ calculo: 20 }`). */
export type AttributePoints = Readonly<Record<string, number>>;

/** Uma missão: o XP e os pontos de atributo são fixos (ver {@link QuestScoring}). */
export interface QuestDoc {
  readonly id: string;
  readonly rewardXp: number;
  readonly attributes?: AttributePoints;
}

/** Uma fase: as missões e as fases que precisam estar concluídas antes. */
export interface PhaseDoc {
  readonly id: string;
  readonly requires: readonly string[];
  readonly quests: readonly QuestDoc[];
}

/** Um degrau da escada: XP total, mínimo de cada atributo e fases obrigatórias. */
export interface LevelDoc {
  readonly id: string;
  readonly minXp: number;
  readonly minAttributes?: AttributePoints;
  readonly requiredPhases?: readonly string[];
}

/** O curso numa versão. */
export interface CourseDoc {
  readonly courseId: string;
  /** Os atributos do catálogo da instituição que o curso usa. */
  readonly attributes: readonly string[];
  readonly levels: readonly LevelDoc[];
  readonly phases: readonly PhaseDoc[];
}

/** As versões publicadas de um curso, pelo número. A mais alta é a atual. */
export type CourseHistory = ReadonlyMap<number, CourseDoc>;

/** Uma missão concluída, com a versão do curso em que valeu (é o que o banco guarda). */
export interface Completion {
  readonly questId: string;
  readonly version: number;
}

/** A versão atual (a mais alta). */
export function latestVersion(history: CourseHistory): number {
  if (history.size === 0) throw new Error('curso sem versões');
  return Math.max(...history.keys());
}

/** A fase de uma missão numa versão. */
export function phaseOfQuest(doc: CourseDoc, questId: string): PhaseDoc | undefined {
  return doc.phases.find((p) => p.quests.some((q) => q.id === questId));
}
