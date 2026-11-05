// O domínio do totem de vídeo: o ID extraído do link (só ele é guardado), o endereço do player sem cookies, as regras
// da parede (a mesma do editor do mundo do produto), a proximidade pela sala como mini-campus e o estado da tela do
// vídeo.
import { describe, expect, it } from 'vitest';
import { playerReducer, scenePaused, CLOSED, type PlayerState } from '../Domain/Player';
import { nearestInteractable } from '../Domain/Proximity';
import { configureTotem, roomAsCampus, roomProblems, toRoom, wallAnchor, type Room, type Totem } from '../Domain/Room';
import { embedUrl, extractVideoId, watchUrl } from '../Domain/YouTube';
import roomData from '../Content/room.json';

const ID = 'aziM2ePu1O8';

describe('o link do YouTube vira só o ID', () => {
  it.each([
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=AbCdEf123`],
    [`youtu.be/${ID}`],
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&si=xyz`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}?rel=0`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])('%s', (link) => {
    expect(extractVideoId(link)).toBe(ID);
  });

  it.each([
    [''],
    ['não é um link'],
    [`https://vimeo.com/${ID}`],
    [`https://youtube.com.evil.example/watch?v=${ID}`],
    [`https://evil.example/?u=https://youtu.be/${ID}`],
    ['https://www.youtube.com/watch?v=curto'],
    [`https://www.youtube.com/watch?v=${ID}x`],
    [`https://www.youtube.com/channel/${ID}`],
    [`javascript:alert(1)//youtu.be/${ID}`],
    [`<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`],
    [`https://user:pw@youtu.be/${ID}`],
  ])('recusa %s', (link) => {
    expect(extractVideoId(link)).toBeNull();
  });

  it('o player é o youtube-nocookie, com o protocolo de avisos e sem o si; o plano B abre no YouTube', () => {
    const url = new URL(embedUrl(ID, 'https://labs.example'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('https://labs.example');
    expect(url.searchParams.has('si')).toBe(false);
    expect(() => embedUrl('"><script>', 'https://x')).toThrow();
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});

const room: Room = toRoom(roomData);
const totem = (patch: Partial<Totem>): Totem => ({ id: 't', kind: 'totem', wall: 'north', offset: 0, width: 2, videoId: ID, titleKey: 'x', ...patch });

describe('o totem na parede', () => {
  it('a sala de exemplo abre sem problemas', () => {
    expect(roomProblems(room)).toEqual([]);
    expect(room.totems.map((t) => t.id)).toEqual(['totem-listening', 'totem-removido']);
  });

  it('Gherkin: o totem sobre a porta não é publicado, e o problema aponta o totem', () => {
    const onDoor = { ...room, totems: [totem({ id: 'porta', wall: 'south', offset: room.doorX })] };
    expect(roomProblems(onDoor)).toEqual([{ code: 'TOTEM_ON_DOOR', totemId: 'porta' }]);
    expect(roomProblems({ ...room, totems: [totem({ wall: 'south', offset: 4 })] })).toEqual([]);
  });

  it('fora da parede, sobre outro totem, com o ID errado ou com o id repetido', () => {
    expect(roomProblems({ ...room, totems: [totem({ offset: 5.5 })] })).toEqual([{ code: 'TOTEM_OUTSIDE', totemId: 't' }]);
    expect(roomProblems({ ...room, totems: [totem({ id: 'a' }), totem({ id: 'b', offset: 1 })] })).toEqual([{ code: 'TOTEMS_OVERLAP', totemId: 'b' }]);
    expect(roomProblems({ ...room, totems: [totem({ id: 'a' }), totem({ id: 'b', wall: 'east' })] })).toEqual([]);
    expect(roomProblems({ ...room, totems: [totem({ videoId: 'https://youtu.be/x' })] })).toEqual([{ code: 'VIDEO_ID_INVALID', totemId: 't' }]);
    expect(roomProblems({ ...room, totems: [totem({ wall: 'east' }), totem({ wall: 'west' })] })).toEqual([{ code: 'ID_DUPLICATE', totemId: 't' }]);
  });

  it('Gherkin: o link que não é do YouTube é recusado, sem mudar nada; o link certo grava só o ID', () => {
    const refused = configureTotem(room, 'totem-listening', { videoId: extractVideoId('https://vimeo.com/123'), wall: 'north', offset: 0 });
    expect(refused).toEqual({ ok: false, problems: [{ code: 'VIDEO_ID_INVALID', totemId: 'totem-listening' }] });
    const ok = configureTotem(room, 'totem-listening', { videoId: extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), wall: 'west', offset: 1 });
    expect(ok.ok && ok.room.totems[0]).toMatchObject({ videoId: 'dQw4w9WgXcQ', wall: 'west', offset: 1 });
    expect(room.totems[0].videoId).toBe(ID);
    expect(configureTotem(room, 'totem-listening', { videoId: ID, wall: 'south', offset: 0 })).toMatchObject({ ok: false, problems: [{ code: 'TOTEM_ON_DOOR' }] });
  });

  it('cada parede vira o totem para o centro; o avatar perto do totem o tem no alcance', () => {
    expect(wallAnchor(6, 'north', 1, 0.2)).toEqual({ x: 1, z: -5.8, rotationY: 0, horizontal: true });
    expect(wallAnchor(6, 'east', 1, 0.2)).toMatchObject({ x: 5.8, z: 1, rotationY: -Math.PI / 2 });
    const campus = roomAsCampus(room);
    expect(campus.start).toMatchObject({ x: room.doorX, z: room.halfSize - 1.5 });
    expect(nearestInteractable(campus.start.x, campus.start.z, campus)).toBeNull();
    expect(nearestInteractable(0, -4.5, campus)?.building.id).toBe('totem-listening');
    expect(nearestInteractable(4.5, -1, campus)?.building.id).toBe('totem-removido');
  });

  it('a sala malformada falha ao abrir a página, com o campo', () => {
    expect(() => toRoom({ ...roomData, halfSize: 40 })).toThrow('halfSize');
    expect(() => toRoom({ ...roomData, totems: [{ ...roomData.totems[0], wall: 'teto' }] })).toThrow('parede');
    expect(() => toRoom({ ...roomData, totems: [{ ...roomData.totems[0], wall: 'south' }] })).toThrow('TOTEM_ON_DOOR');
  });
});

describe('a tela do vídeo', () => {
  const open = playerReducer(CLOSED, { type: 'open', totemId: 't' });

  it('abre carregando, fica pronta, e fecha; a cena fica parada enquanto está aberta', () => {
    expect(open).toEqual({ status: 'loading', totemId: 't' });
    expect(scenePaused(open)).toBe(true);
    const ready = playerReducer(open, { type: 'ready' });
    expect(ready).toEqual({ status: 'ready', totemId: 't' });
    expect(playerReducer(ready, { type: 'close' })).toBe(CLOSED);
    expect(scenePaused(CLOSED)).toBe(false);
  });

  it('os erros do player e a falta de resposta viram o motivo do aviso', () => {
    expect(playerReducer(open, { type: 'error', code: 150 })).toMatchObject({ status: 'failed', reason: 'embedBlocked' });
    expect(playerReducer(open, { type: 'error', code: 101 })).toMatchObject({ reason: 'embedBlocked' });
    expect(playerReducer(open, { type: 'error', code: 100 })).toMatchObject({ reason: 'unavailable' });
    expect(playerReducer(open, { type: 'timeout' })).toMatchObject({ reason: 'noResponse' });
  });

  it('um aviso atrasado não muda nada: o prazo depois de pronto, ou qualquer aviso depois de fechar', () => {
    const ready: PlayerState = { status: 'ready', totemId: 't' };
    expect(playerReducer(ready, { type: 'timeout' })).toBe(ready);
    expect(playerReducer(CLOSED, { type: 'ready' })).toBe(CLOSED);
    expect(playerReducer(CLOSED, { type: 'error', code: 150 })).toBe(CLOSED);
    expect(playerReducer(CLOSED, { type: 'close' })).toBe(CLOSED);
  });
});
