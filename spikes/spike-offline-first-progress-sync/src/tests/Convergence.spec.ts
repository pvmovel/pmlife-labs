// Testes de convergência: aparelhos do mesmo aluno concluindo missões em ordens diferentes, com a rede caindo e
// respostas se perdendo. Os cenários do Gherkin da US31 e, por fim, centenas de sequências aleatórias (com semente).
import { describe, expect, it } from 'vitest';
import { DeviceProgress } from '../Application/UseCases/SyncProgress';
import { deriveXp, QuestCatalog } from '../Domain/ProgressMerge';
import { FlakyLink, type LinkMode } from '../Infrastructure/FlakyLink';
import { InMemoryProgressServer } from '../Infrastructure/InMemoryProgressServer';
import data from '../Content/catalog.json';

const catalog = new QuestCatalog(data.trackId, data.quests);
const ids = data.quests.map((q) => q.id);
const now = new Date('2026-10-22T10:00:00Z');
const sorted = (xs: readonly string[]) => [...xs].sort();

const setup = (devices = 2, userId = 'ana') => {
  const server = new InMemoryProgressServer(new Map([[catalog.trackId, catalog]]));
  const links = Array.from({ length: devices }, () => new FlakyLink(server));
  const all = links.map((l) => new DeviceProgress(userId, catalog, l));
  return { server, links, devices: all };
};

describe('Gherkin da US31', () => {
  it('progresso em dois aparelhos: o que o celular conclui aparece no computador depois da sincronização', async () => {
    const { devices: [phone, pc] } = setup();
    phone.complete('fases-da-lua', now);
    expect(await phone.sync()).toEqual({ status: 'synced', rejected: [] });
    expect(pc.state.completed).toEqual([]);
    await pc.sync();
    expect(pc.state.completed).toEqual(['fases-da-lua']);
    expect(pc.state.xp).toBe(300);
  });

  it('missão concluída sem internet: vale na hora no aparelho e é enviada quando a conexão volta', async () => {
    const { server, links: [link], devices: [phone] } = setup(1);
    link.mode = 'offline';
    phone.complete('constelacoes', now);
    expect(phone.state).toEqual({ completed: ['constelacoes'], xp: 500, pending: 1 });
    expect(await phone.sync()).toEqual({ status: 'offline' });
    expect(server.rows.size).toBe(0);
    link.mode = 'online';
    await phone.sync();
    expect(phone.state.pending).toBe(0);
    expect(server.rows.size).toBe(1);
  });

  it('XP nunca em dobro: o mesmo evento chegando duas vezes ao servidor conta uma vez', async () => {
    const { server, links: [link], devices: [phone] } = setup(1);
    phone.complete('eclipse', now);
    link.mode = 'lostReply'; // o servidor grava, mas a resposta se perde
    expect(await phone.sync()).toEqual({ status: 'offline' });
    expect(server.rows.size).toBe(1);
    expect(phone.state.pending).toBe(1); // o aparelho não sabe que gravou: vai reenviar
    link.mode = 'online';
    await phone.sync();
    expect(server.received).toBe(2);
    expect(server.rows.size).toBe(1);
    expect(phone.state).toEqual({ completed: ['eclipse'], xp: 1000, pending: 0 });
  });
});

describe('outros casos', () => {
  it('a mesma missão concluída nos dois aparelhos offline: depois de sincronizar, uma linha e o XP uma vez', async () => {
    const { server, links, devices: [phone, pc] } = setup();
    links.forEach((l) => (l.mode = 'offline'));
    phone.complete('montar-telescopio', now);
    pc.complete('montar-telescopio', now);
    pc.complete('fases-da-lua', now);
    links.forEach((l) => (l.mode = 'online'));
    await phone.sync();
    await pc.sync();
    await phone.sync();
    expect(server.rows.size).toBe(2);
    expect(phone.state.xp).toBe(1000);
    expect(pc.state.xp).toBe(1000);
  });

  it('o navegador fechou com a fila cheia: reabrindo pelo snapshot, a fila é enviada', async () => {
    const { server, links: [link] } = setup(1);
    link.mode = 'offline';
    const before = new DeviceProgress('ana', catalog, link);
    before.complete('constelacoes', now);
    const reopened = new DeviceProgress('ana', catalog, link, before.snapshot());
    link.mode = 'online';
    await reopened.sync();
    expect(server.rows.size).toBe(1);
    expect(reopened.state.pending).toBe(0);
  });

  it('visitante que entra na conta leva as missões que fez neste navegador (decisão do produto)', async () => {
    const { server, devices: [pc, phone] } = setup();
    phone.complete('eclipse', now);
    await phone.sync();
    expect(pc.adoptGuestProgress(['fases-da-lua', 'eclipse', 'inventada'], now)).toBe(2);
    await pc.sync();
    expect(sorted(pc.state.completed)).toEqual(sorted(['fases-da-lua', 'eclipse']));
    expect(server.rows.size).toBe(2);
    expect(pc.state.xp).toBe(1300);
  });

  it('missão fora do catálogo enviada direto ao servidor é recusada, sai da fila e não vale XP', async () => {
    const { server } = setup(1);
    const reply = await server.sync('ana', catalog.trackId, [{ key: 'ana:clube-astronomia:hack', questId: 'hack', completedAt: '' }]);
    expect(reply).toEqual({ completed: [], acknowledged: ['ana:clube-astronomia:hack'], rejected: ['hack'] });
    expect(server.rows.size).toBe(0);
  });

  it('cada aluno tem o próprio progresso: o servidor não mistura alunos', async () => {
    const { server } = setup(0);
    const ana = new DeviceProgress('ana', catalog, server);
    const bia = new DeviceProgress('bia', catalog, server);
    ana.complete('eclipse', now);
    await ana.sync();
    await bia.sync();
    expect(bia.state.completed).toEqual([]);
  });
});

describe('convergência sob falhas aleatórias', () => {
  /** Gerador determinístico (mulberry32): a mesma semente repete a mesma sequência, para reproduzir uma falha. */
  const rng = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('300 sequências de 3 aparelhos (ordens, quedas, respostas perdidas, abas fechadas) sempre convergem', async () => {
    const modes: LinkMode[] = ['online', 'offline', 'lostReply'];
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const { server, links, devices } = setup(3);
      const all = [...devices];
      const done = new Set<string>();
      for (let step = 0; step < 25; step++) {
        const i = Math.floor(r() * all.length);
        const op = r();
        if (op < 0.4) {
          const q = ids[Math.floor(r() * ids.length)];
          all[i].complete(q, now);
          done.add(q);
        } else if (op < 0.75) {
          await all[i].sync();
        } else if (op < 0.9) {
          links[i].mode = modes[Math.floor(r() * modes.length)];
        } else {
          all[i] = new DeviceProgress('ana', catalog, links[i], all[i].snapshot()); // fechou e reabriu a aba
        }
      }
      links.forEach((l) => (l.mode = 'online'));
      for (let round = 0; round < 2; round++) for (const d of all) await d.sync();
      const expected = sorted([...done]);
      for (const d of all) {
        expect(sorted(d.state.completed), `semente ${seed}`).toEqual(expected);
        expect(d.state.xp, `semente ${seed}`).toBe(deriveXp(expected, catalog));
        expect(d.state.pending, `semente ${seed}`).toBe(0);
      }
      expect(server.rows.size, `semente ${seed}`).toBe(expected.length);
    }
  });
});
