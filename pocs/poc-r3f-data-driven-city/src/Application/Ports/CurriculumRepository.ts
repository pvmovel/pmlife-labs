// Port: de onde vem a cidade de cada trilha. Hoje, JSON versionado; amanhã, banco ou API por cliente (tenant).
import type { CityDefinition } from '../../Domain/City';

export interface TrackSummary {
  readonly trackId: string;
  readonly labelKey: string;
}

export interface CurriculumRepository {
  listTracks(): Promise<TrackSummary[]>;
  /** @throws Error se a trilha não existir ou se a cidade for inválida (ver validateCity). */
  getCity(trackId: string): Promise<CityDefinition>;
}
