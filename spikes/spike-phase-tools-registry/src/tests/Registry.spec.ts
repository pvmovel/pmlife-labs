// O registro em si (US57): o da plataforma tem o quadro e o totem; um tipo novo entra só com uma entrada no JSON (o
// editor passa a oferecê-lo e a tecla E sabe o que fazer), sem mudar o resultado dos outros tipos; e um registro
// malformado não sobe, dizendo o tipo e o campo.
import { describe, expect, it } from 'vitest';
import { actionOf, editorKinds, parseRegistry, validateItems } from '@domain/ToolRegistry';
import { key, loadCases, readJson, registryOf } from './conformance';

const base = readJson('src/Content/tool-types.json');
const example = readJson('fixtures/example-type.json');
const type = (over: Record<string, unknown>) => ({ types: [{ kind: 'novo', label: { 'pt-BR': 'Novo', 'en-US': 'New' }, icon: 'x', quest: 'none', target: true, action: 'modal', fields: {}, ...over }] });

describe('o registro de tipos', () => {
  it('o da plataforma tem o quadro e o totem de vídeo, na ordem do editor', () => {
    expect(editorKinds(registryOf(['base']), 'pt-BR')).toEqual([
      { kind: 'board', label: 'Quadro', icon: 'board' },
      { kind: 'totem', label: 'Totem de vídeo', icon: 'video' },
    ]);
  });

  it('Gherkin "Tipo novo sem mexer no motor": o editor oferece o tipo novo, e a tecla E sabe o que ele faz', () => {
    const registry = registryOf(['base', 'example']);
    expect(editorKinds(registry, 'en-US').map((k) => k.label)).toEqual(['Board', 'Video totem', 'Sample quiz']);
    expect([actionOf(registry, 'totem'), actionOf(registry, 'quiz-demo'), actionOf(registry, 'board')]).toEqual(['video', 'modal', 'none']);
  });

  it('o tipo novo não muda o resultado de nenhum caso dos tipos de antes (Open/Closed)', () => {
    // Os casos só com o registro da plataforma (menos o do tipo fora do registro, que é exatamente o que muda).
    const before = loadCases().filter(([file, k]) => !k.registries.includes('example') && !file.includes('fora-do-registro'));
    expect(before).toHaveLength(12);
    for (const [name, c] of before) {
      const ctx = { buildingId: c.room.buildingId, quests: c.quests, texts: c.texts };
      expect(validateItems(c.room.items, registryOf(['base', 'example']), ctx).map(key), name).toEqual(validateItems(c.room.items, registryOf(['base']), ctx).map(key));
    }
  });

  it('Gherkin "Totem de vídeo continua igual": validar não muda o documento', () => {
    const items = [{ id: 't', wall: 'north', offset: 0, width: 2, kind: 'totem', textKey: 'k', videoId: 'aziM2ePu1O8' }];
    const before = JSON.stringify(items);
    validateItems(items, registryOf(['base']), { buildingId: 'b', quests: [], texts: ['k'] });
    expect(JSON.stringify(items)).toBe(before);
  });

  it('registro malformado não sobe, e o erro diz o tipo e o campo', () => {
    expect(() => parseRegistry(base, base)).toThrow('o tipo "board" está repetido');
    expect(() => parseRegistry(type({ kind: 'Novo' }))).toThrow('kind "Novo" fora do formato');
    expect(() => parseRegistry(type({ fields: { nota: { format: 'decimal' } } }))).toThrow('novo.nota tem o formato desconhecido "decimal"');
    expect(() => parseRegistry(type({ fields: { nota: { format: 'int', min: 10, max: 1 } } }))).toThrow('novo.nota (int) precisa de min <= max');
    expect(() => parseRegistry(type({ fields: { modo: { format: 'enum', values: [] } } }))).toThrow('novo.modo (enum) precisa dos valores');
    expect(() => parseRegistry(type({ fields: { questId: { format: 'textKey' } } }))).toThrow('novo.questId não pode ser campo de um tipo');
    expect(() => parseRegistry(type({ target: false }))).toThrow('novo tem ação, mas não é alvo da tecla E');
    expect(() => parseRegistry(type({ quest: 'sempre' }))).toThrow('novo.quest');
    expect(() => parseRegistry(type({ label: { 'pt-BR': 'Novo' } }))).toThrow('novo precisa do nome em pt-BR e en-US');
    expect(() => parseRegistry(type({ exclusive: { fields: ['a', 'b'], both: 'X' } }))).toThrow('novo.exclusive');
    expect(parseRegistry(base, example).size).toBe(3);
  });
});
