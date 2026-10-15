// Só para a comparação da demo: o padrão "if/else de limiares" que sobe UM nível por concessão de XP.
import type { CareerLadder } from '../Domain/CareerLadder';

export function naiveNextIndex(ladder: CareerLadder, currentIndex: number, xpAfter: number): number {
  const next = ladder.all()[currentIndex + 1];
  return next && xpAfter >= next.minXp ? currentIndex + 1 : currentIndex;
}
