// Monta as escadas a partir do conteúdo (JSON). Uma trilha nova = um JSON novo; o domínio não muda.
import { CareerLadder } from '../Domain/CareerLadder';
import culinaria from '../Content/culinaria.json';
import idiomas from '../Content/idiomas.json';

export interface Quest {
  id: string;
  label: string;
  xp: number;
}

export interface Track {
  id: string;
  name: string;
  ladder: CareerLadder;
  quests: Quest[];
}

export const TRACKS: Track[] = [culinaria, idiomas].map((t) => ({
  id: t.trackId,
  name: t.name,
  ladder: new CareerLadder(t.trackId, t.levels),
  quests: t.quests,
}));
