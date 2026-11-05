// O Domain do editor: a validação (a mesma que o servidor confere antes de publicar), as edições puras e o ciclo de
// rascunho e publicação.
import { describe, expect, it } from 'vitest';
import { demoInstitutions } from '../Content/fakeWorlds';
import { copyForEditing, discardDraft, publish, published, saveDraft, versionOf, working, type WorldDocument } from '../Domain/Drafts';
import {
  addBuilding,
  addStation,
  addWallItem,
  buildingOfPath,
  moveBuilding,
  moveSpawn,
  pathOf,
  removeBuilding,
  selectionAt,
  updateBuilding,
  updateInterior,
  updateStation,
  updateWallItem,
} from '../Domain/editing';
import { validateWorld } from '../Domain/validateWorld';
import type { World } from '../Domain/World';

const aurora = () => demoInstitutions()[0];
const docOf = (id: string): WorldDocument => aurora().documents.find((d) => d.id === id)!;
const phase = (): World => published(docOf('ingles.fase-1'));
const codes = (w: World) => validateWorld(w).map((p) => `${p.code} ${p.path}${p.param ? ` ${p.param}` : ''}`);

describe('validação do mundo', () => {
  it('os mundos da demo são válidos', () => {
    for (const inst of demoInstitutions()) for (const d of inst.documents) expect(codes(published(d)), `${inst.slug}/${d.id}`).toEqual([]);
  });

  it('prédio fora do mapa, sobreposto, sem nome, com cor inválida; chegada dentro de um prédio', () => {
    let w = phase();
    w = updateBuilding(w, 'cafe', { x: -6, z: -4 });
    expect(codes(w)).toEqual(['BUILDINGS_OVERLAP /buildings/0 /buildings/1']);
    w = updateBuilding(updateBuilding(phase(), 'cafe', { x: 13 }), 'biblioteca', { label: { pt: ' ', en: 'Library' }, color: 'laranja' });
    expect(codes(w)).toEqual(['TEXT_EMPTY /buildings/0', 'COLOR_INVALID /buildings/0', 'OUT_OF_MAP /buildings/1']);
    expect(codes(moveSpawn(phase(), -6, -4))).toEqual(['SPAWN_INSIDE_BUILDING /spawn /buildings/0']);
  });

  it('o prédio obrigatório não sai da cidade; o comum sai, com o interior', () => {
    const sede = published(docOf('sede'));
    expect(removeBuilding(sede, 'matriculas')).toBeNull();
    const w = removeBuilding(phase(), 'biblioteca')!;
    expect(w.buildings.map((b) => b.id)).toEqual(['cafe']);
    expect(w.interiors).toEqual([]);
    // Um documento antigo sem o prédio obrigatório não passa.
    expect(codes({ ...sede, buildings: sede.buildings.filter((b) => b.role !== 'enrollment') })).toEqual(['ROLE_MISSING / enrollment']);
  });

  it('Gherkin: uma estação sobre a porta da sala é recusada, apontando a estação', () => {
    let w = phase();
    ({ world: w } = addStation(w, 'biblioteca', 'verbos'));
    w = updateStation(w, 'biblioteca', 'estacao-1', { x: 0, z: 5 });
    expect(codes(w)).toEqual(['STATION_BLOCKS_DOOR /interiors/0/stations/0']);
  });

  it('estações: fora das paredes, sobrepostas, ligadas a missão de outro prédio', () => {
    let w = phase();
    ({ world: w } = addStation(w, 'biblioteca', 'verbos'));
    ({ world: w } = addStation(w, 'biblioteca', 'pedido'));
    expect(codes(w)).toEqual(['STATION_QUEST_UNKNOWN /interiors/0/stations/1 pedido']);
    w = updateStation(w, 'biblioteca', 'estacao-2', { questId: 'leitura', x: -6, z: 0 });
    expect(codes(w)).toEqual(['STATION_OUTSIDE_WALLS /interiors/0/stations/1']);
    const first = w.interiors[0].stations[0];
    w = updateStation(w, 'biblioteca', 'estacao-2', { x: first.x + 0.5, z: first.z });
    expect(codes(w)).toEqual(['STATIONS_OVERLAP /interiors/0/stations/0 /interiors/0/stations/1']);
  });

  it('objetos de parede: fora da parede, sobre a porta, sobrepostos', () => {
    let w = phase();
    ({ world: w } = addWallItem(w, 'biblioteca', { pt: 'Horário', en: 'Hours' }));
    expect(w.interiors[0].wallItems[1].offset).not.toBe(0);
    expect(codes(w)).toEqual([]);
    w = updateWallItem(w, 'biblioteca', 'quadro-2', { offset: 0 });
    expect(codes(w)).toEqual(['WALL_ITEMS_OVERLAP /interiors/0/wallItems/0 /interiors/0/wallItems/1']);
    w = updateWallItem(w, 'biblioteca', 'quadro-2', { wall: 'south' });
    expect(codes(w)).toEqual(['WALL_ITEM_ON_DOOR /interiors/0/wallItems/1']);
    w = updateWallItem(w, 'biblioteca', 'quadro-2', { wall: 'east', offset: 5.5 });
    expect(codes(w)).toEqual(['WALL_ITEM_OUTSIDE /interiors/0/wallItems/1']);
  });

  it('a sala: tamanho fora dos limites e porta fora da parede', () => {
    expect(codes(updateInterior(phase(), 'biblioteca', { halfSize: 2 }))).toContain('ROOM_SIZE_INVALID /interiors/0');
    expect(codes(updateInterior(phase(), 'biblioteca', { doorX: 5.5 }))).toEqual(['DOOR_OUTSIDE /interiors/0']);
  });
});

describe('edições', () => {
  it('tudo anda na grade de meio metro; o prédio novo nasce num lugar livre', () => {
    const w = moveBuilding(phase(), 'cafe', 0.3, -0.8);
    expect(w.buildings[1]).toMatchObject({ x: 6.5, z: -5 });
    const added = addBuilding(phase(), { pt: 'Prédio novo', en: 'New building' });
    expect(added.id).toBe('predio-1');
    expect(codes(added.world)).toEqual([]);
  });

  it('a estação nova nasce fora da faixa da porta e longe das outras', () => {
    let w = phase();
    for (let i = 0; i < 6; i++) ({ world: w } = addStation(w, 'biblioteca', 'verbos'));
    expect(w.interiors[0].stations).toHaveLength(6);
    expect(codes(w)).toEqual([]);
  });

  it('a seleção e o caminho dos problemas se convertem um no outro', () => {
    let w = phase();
    ({ world: w } = addStation(w, 'biblioteca', 'verbos'));
    for (const sel of [{ type: 'spawn' }, { type: 'building', id: 'cafe' }, { type: 'station', buildingId: 'biblioteca', id: 'estacao-1' }, { type: 'wallItem', buildingId: 'biblioteca', id: 'quadro-1' }] as const) {
      expect(selectionAt(w, pathOf(w, sel)!)).toEqual(sel);
    }
    expect(selectionAt(w, '/')).toBeNull();
    expect(buildingOfPath(w, '/interiors/0/stations/0')).toBe('biblioteca');
  });
});

describe('rascunho e publicação', () => {
  it('editar mexe só no rascunho; publicar cria a versão e apaga o rascunho', () => {
    let d = docOf('ingles.fase-1');
    d = saveDraft(d, addStation(working(d), 'biblioteca', 'verbos').world);
    expect(published(d).interiors[0].stations).toHaveLength(0);
    const r = publish(d);
    expect(r.ok && r.version).toBe(2);
    if (r.ok) {
      expect(r.doc.draft).toBeNull();
      expect(published(r.doc).interiors[0].stations).toHaveLength(1);
    }
  });

  it('com problema, não publica e devolve os problemas; descartar volta à versão publicada', () => {
    let d = docOf('ingles.fase-1');
    d = saveDraft(d, updateBuilding(working(d), 'cafe', { x: 13 }));
    const r = publish(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.map((p) => p.code)).toEqual(['OUT_OF_MAP']);
    expect(versionOf(d)).toBe(1);
    expect(discardDraft(d).draft).toBeNull();
  });

  it('o documento da plataforma não se edita; a cópia é da instituição', () => {
    const p = docOf('trilha-modelo');
    expect(() => saveDraft(p, published(p))).toThrow();
    const c = copyForEditing(p, 'trilha-modelo-copia', { pt: 'Cópia', en: 'Copy' });
    expect(c.source).toBe('tenant');
    expect(saveDraft(c, published(c)).draft).not.toBeNull();
  });
});
