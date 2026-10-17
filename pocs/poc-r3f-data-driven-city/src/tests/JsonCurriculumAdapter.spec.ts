import { describe, expect, it } from 'vitest';
import { JsonCurriculumAdapter } from '../Infrastructure/JsonCurriculumAdapter';
import { MESSAGES, translate } from '../Presentation/i18n/I18n';
import type { CityDefinition } from '../Domain/City';

describe('JsonCurriculumAdapter', () => {
  it('descobre as trilhas pelas pastas de src/Content/Curriculum (sem lista no código)', async () => {
    const tracks = await new JsonCurriculumAdapter().listTracks();
    expect(tracks.map((t) => t.trackId)).toEqual(['culinaria', 'idiomas']);
  });

  it('todas as cidades do conteúdo são válidas e todo rótulo existe nos dois idiomas', async () => {
    const repo = new JsonCurriculumAdapter();
    for (const { trackId } of await repo.listTracks()) {
      const city = await repo.getCity(trackId);
      for (const key of [city.labelKey, ...city.buildings.map((b) => b.labelKey)]) {
        for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
          expect(translate(lang, key), `${lang}:${key}`).not.toBe(key);
        }
      }
    }
  });

  it('um arquivo novo vira uma cidade nova, sem mudar código', async () => {
    const nova: CityDefinition = {
      trackId: 'enem',
      labelKey: 'tracks.enem',
      buildings: [{ id: 'sala', labelKey: 'b.sala', position: [0, 0], size: [3, 3, 3], color: '#123456' }],
    };
    const repo = new JsonCurriculumAdapter({ 'enem/buildings.json': nova });
    expect(await repo.listTracks()).toEqual([{ trackId: 'enem', labelKey: 'tracks.enem' }]);
    expect((await repo.getCity('enem')).buildings).toHaveLength(1);
  });

  it('cidade inválida não chega à cena', async () => {
    const quebrada: CityDefinition = {
      trackId: 'x',
      labelKey: 'tracks.x',
      buildings: [
        { id: 'a', labelKey: 'b.a', position: [0, 0], size: [4, 4, 4], color: '#123456' },
        { id: 'b', labelKey: 'b.b', position: [1, 0], size: [4, 4, 4], color: '#123456' },
      ],
    };
    await expect(new JsonCurriculumAdapter({ f: quebrada }).getCity('x')).rejects.toThrow('a e b se sobrepõem');
  });
});
