// Regra de merge (Domain): união, XP derivado do catálogo, propriedades que garantem a convergência e a fila local.
import { describe, expect, it } from 'vitest';
import { Outbox } from '../Domain/Outbox';
import { completionKey, deriveXp, knownCompletions, mergeCompletions, QuestCatalog } from '../Domain/ProgressMerge';

const catalog = new QuestCatalog('t', [
  { id: 'a', title: 'A', rewardXp: 100 },
  { id: 'b', title: 'B', rewardXp: 200 },
  { id: 'c', title: 'C', rewardXp: 400 },
]);

describe('mergeCompletions', () => {
  it('é a união: repetidas contam uma vez, e a ordem de chegada é preservada', () => {
    expect(mergeCompletions(['a', 'b'], ['b', 'c', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('comutativa, associativa e idempotente (como conjunto): qualquer ordem chega ao mesmo estado', () => {
    const set = (xs: readonly string[]) => [...xs].sort();
    const x = ['a'];
    const y = ['b', 'a'];
    const z = ['c'];
    expect(set(mergeCompletions(x, y))).toEqual(set(mergeCompletions(y, x)));
    expect(set(mergeCompletions(mergeCompletions(x, y), z))).toEqual(set(mergeCompletions(x, mergeCompletions(y, z))));
    expect(set(mergeCompletions(y, y))).toEqual(set(y));
  });
});

describe('XP derivado do catálogo', () => {
  it('é a soma das recompensas das missões concluídas, cada uma uma vez', () => {
    expect(deriveXp(['a', 'c', 'a'], catalog)).toBe(500);
    expect(deriveXp([], catalog)).toBe(0);
  });

  it('missão fora do catálogo (inventada ou de outra trilha) nunca vale XP', () => {
    expect(deriveXp(['a', 'xp-infinito'], catalog)).toBe(100);
    expect(knownCompletions(['xp-infinito', 'b'], catalog)).toEqual(['b']);
  });

  it('o catálogo recusa recompensa inválida', () => {
    expect(() => new QuestCatalog('t', [{ id: 'x', title: 'X', rewardXp: 0 }])).toThrow();
    expect(() => new QuestCatalog('t', [{ id: 'x', title: 'X', rewardXp: 1.5 }])).toThrow();
  });
});

describe('Outbox', () => {
  it('chave de idempotência por aluno, trilha e missão; concluir de novo não duplica a fila', () => {
    const o = new Outbox('ana', 't');
    const first = o.add('a', '2026-10-22T10:00:00.000Z');
    const again = o.add('a', '2026-10-22T11:00:00.000Z');
    expect(first.key).toBe(completionKey('ana', 't', 'a'));
    expect(again).toBe(first);
    expect(o.size).toBe(1);
  });

  it('só sai da fila o que o servidor confirmou', () => {
    const o = new Outbox('ana', 't');
    o.add('a', 'x');
    o.add('b', 'y');
    o.acknowledge([completionKey('ana', 't', 'a')]);
    expect(o.pending().map((p) => p.questId)).toEqual(['b']);
  });

  it('reabre com a fila que estava gravada (o navegador fechou antes de enviar)', () => {
    const o = new Outbox('ana', 't');
    o.add('c', 'z');
    expect(new Outbox('ana', 't', o.pending()).pending()).toEqual(o.pending());
  });
});
