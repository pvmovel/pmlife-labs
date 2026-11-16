// Os casos de conformidade (cases/*.json) no TypeScript: os mesmos que o php/verify.php roda no PHP.
import { describe, expect, it } from 'vitest';
import { validateItems } from '@domain/ToolRegistry';
import { key, loadCases, registryOf } from './conformance';

describe('casos de conformidade (TypeScript)', () => {
  const cases = loadCases();

  it('há os 19 casos', () => {
    expect(cases).toHaveLength(19);
  });

  it.each(cases)('%s', (_name, c) => {
    const problems = validateItems(c.room.items, registryOf(c.registries), { buildingId: c.room.buildingId, quests: c.quests, texts: c.texts });
    expect(problems.map(key).sort(), c.description).toEqual([...c.expect].sort());
  });
});
