// Quanto uma missão concluída vale. Hoje é fixo (o que o documento diz); a nota proporcional (ex.: 70% de acerto
// vale 70% dos pontos) é outra implementação desta interface, sem mexer na progressão (Open/Closed).
import type { AttributePoints, QuestDoc } from './CourseDocument';

export interface QuestScore {
  readonly xp: number;
  readonly attributes: AttributePoints;
}

export interface QuestScoring {
  score(quest: QuestDoc): QuestScore;
}

/** XP e pontos de atributo fixos, como no documento. */
export const fixedScoring: QuestScoring = {
  score: (quest) => ({ xp: quest.rewardXp, attributes: quest.attributes ?? {} }),
};
