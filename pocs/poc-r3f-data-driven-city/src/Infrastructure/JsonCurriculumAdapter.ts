// Adapter: descobre as trilhas pelos arquivos src/Content/Curriculum/<trilha>/buildings.json.
// Uma pasta nova é uma cidade nova, sem mudar código. Cada cidade é validada antes de ser entregue.
import type { CurriculumRepository, TrackSummary } from '../Application/Ports/CurriculumRepository';
import { validateCity, type CityDefinition } from '../Domain/City';

const FILES = import.meta.glob<CityDefinition>('../Content/Curriculum/*/buildings.json', { eager: true, import: 'default' });

export class JsonCurriculumAdapter implements CurriculumRepository {
  private readonly cities: ReadonlyMap<string, CityDefinition>;

  constructor(files: Record<string, CityDefinition> = FILES) {
    this.cities = new Map(Object.values(files).map((city) => [city.trackId, city]));
  }

  async listTracks(): Promise<TrackSummary[]> {
    return [...this.cities.values()]
      .map(({ trackId, labelKey }) => ({ trackId, labelKey }))
      .sort((a, b) => a.trackId.localeCompare(b.trackId));
  }

  async getCity(trackId: string): Promise<CityDefinition> {
    const city = this.cities.get(trackId);
    if (!city) throw new Error(`trilha desconhecida: ${trackId}`);
    const errors = validateCity(city);
    if (errors.length) throw new Error(`cidade inválida (${trackId}): ${errors.join('; ')}`);
    return city;
  }
}
