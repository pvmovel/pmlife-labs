// As estratégias de cada plataforma: os links aceitos e recusados, o documento (formato novo e o `videoId` de antes),
// o endereço do player e a leitura das mensagens reais gravadas pela medição (results/medicao.json).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOADING, playbackReducer, type PlaybackState } from '../Domain/Playback';
import { parseVideoLink, readTotemVideo, sourceOf, SOURCES, type VideoRef } from '../Domain/VideoSource';

// Os testes rodam na raiz do spike (yarn verify).
const json = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
const links = json('cases/links.json') as { accepted: [string, VideoRef][]; rejected: [string, string][] };
const documents = json('cases/documents.json') as { cases: [string, Record<string, unknown>, VideoRef | string][] };
const measured = json('results/medicao.json') as {
  results: { provider: string; kind: string; stored: VideoRef; sample: string | null; signals: string[]; playerStatus: number | null; cookiesAfterPlay: string[] }[];
};

describe('o link colado pelo master', () => {
  it.each(links.accepted)('aceita %s', (link, expected) => {
    expect(parseVideoLink(link)).toEqual(expected);
  });
  it.each(links.rejected)('recusa %s (%s)', (link) => {
    expect(parseVideoLink(link)).toBeNull();
  });
  it('cobre as quatro plataformas da primeira versão', () => {
    expect(SOURCES.map((s) => s.provider)).toEqual(['youtube', 'vimeo', 'panda', 'bunny']);
    expect(new Set(links.accepted.map(([, r]) => r.provider))).toEqual(new Set(['youtube', 'vimeo', 'panda', 'bunny']));
  });
});

describe('o documento do totem (os casos de conformidade dos dois validadores)', () => {
  it.each(documents.cases)('%s', (_name, totem, expected) => {
    expect(readTotemVideo(totem)).toEqual(expected);
  });
  it('o link aceito vira um documento válido (ida e volta)', () => {
    for (const [, ref] of links.accepted) expect(readTotemVideo({ video: ref })).toEqual(ref);
  });
});

describe('o endereço do player', () => {
  const origin = 'https://exemplo.test';
  it('o YouTube continua igual ao da US38 (youtube-nocookie, enablejsapi e a origem da página)', () => {
    expect(sourceOf({ provider: 'youtube', id: 'dQw4w9WgXcQ' }).embedUrl({ provider: 'youtube', id: 'dQw4w9WgXcQ' }, origin)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&playsinline=1&origin=https%3A%2F%2Fexemplo.test',
    );
  });
  it('o Vimeo vai com dnt=1 e leva o h do vídeo não listado', () => {
    const ref: VideoRef = { provider: 'vimeo', id: '76979871', hash: '0a1b2c3d4e' };
    expect(sourceOf(ref).embedUrl(ref, origin)).toBe('https://player.vimeo.com/video/76979871?h=0a1b2c3d4e&dnt=1&playsinline=1');
  });
  it('o Panda usa a zona do link, que também é a origem das mensagens', () => {
    const ref: VideoRef = { provider: 'panda', zone: 'ded14ebd-85a', id: '3b101f05-84aa-4de0-9b64-71f1855388af' };
    expect(sourceOf(ref).embedUrl(ref, origin)).toBe('https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af');
    expect(sourceOf(ref).playerOrigin(ref)).toBe('https://player-vz-ded14ebd-85a.tv.pandavideo.com.br');
  });
  it('o Bunny fica no player do link (o novo, ou o antigo quando o master colou o antigo)', () => {
    const ref: VideoRef = { provider: 'bunny', library: '767357', id: '6dae38a5-9322-401a-a6e6-76e7cbb368dd' };
    expect(sourceOf(ref).embedUrl(ref, origin)).toMatch(/^https:\/\/player\.mediadelivery\.net\/embed\/767357\//);
    expect(sourceOf({ ...ref, legacy: true }).playerOrigin({ ...ref, legacy: true })).toBe('https://iframe.mediadelivery.net');
  });
  it('a página pública só existe no YouTube e no Vimeo', () => {
    expect(SOURCES.filter((s) => links.accepted.some(([, r]) => r.provider === s.provider && s.watchUrl(r as never) !== null)).map((s) => s.provider)).toEqual(['youtube', 'vimeo']);
  });
});

describe('as mensagens reais dos players (medidas no Chrome)', () => {
  it.each(measured.results.map((r) => [`${r.provider} (${r.kind})`, r] as const))('%s', (_name, r) => {
    const source = sourceOf(r.stored);
    if (r.sample === null) {
      // Sem nenhuma mensagem, quem avisa o aluno é o prazo.
      expect(r.signals).toEqual([]);
      return;
    }
    const signal = source.read(r.sample);
    expect(signal).not.toBeNull();
    expect(r.signals[0]).toBe(signal!.type === 'ready' ? 'ready' : `error:${(signal as { reason: string }).reason}`);
  });
  it('nenhuma plataforma lê a mensagem da outra', () => {
    for (const r of measured.results.filter((x) => x.sample !== null)) {
      for (const other of SOURCES.filter((s) => s.provider !== r.provider)) expect(other.read(r.sample)).toBeNull();
    }
  });
  it('o vídeo inexistente do Vimeo e do Bunny é detectado (erro ou prazo); o do Panda toca o aviso do próprio player', () => {
    const missing = (p: string) => measured.results.find((r) => r.provider === p && r.kind === 'inexistente')!;
    expect(missing('vimeo').signals).toEqual(['error:unavailable']);
    expect(missing('bunny').signals).toEqual([]);
    expect(missing('bunny').playerStatus).toBe(404);
    expect(missing('panda').signals).toEqual(['ready']);
  });
  it('privacidade: nenhum cookie de rastreamento (o Vimeo com dnt=1 só grava os do Cloudflare contra robôs)', () => {
    const tracking = /(^|\s)(vuid|player|_ga|_gid|_fbp|IDE|VISITOR_INFO1_LIVE|YSC)$/;
    for (const r of measured.results) expect(r.cookiesAfterPlay.filter((c) => tracking.test(c))).toEqual([]);
  });
});

describe('a tela do vídeo (a mesma máquina da US38)', () => {
  const run = (...events: Parameters<typeof playbackReducer>[1][]): PlaybackState => events.reduce(playbackReducer, LOADING);
  it('pronto toca; erro mostra o aviso com o motivo', () => {
    expect(run({ type: 'ready' })).toEqual({ status: 'ready' });
    expect(run({ type: 'error', reason: 'embedBlocked' })).toEqual({ status: 'failed', reason: 'embedBlocked' });
  });
  it('o prazo só vale enquanto carrega', () => {
    expect(run({ type: 'timeout' })).toEqual({ status: 'failed', reason: 'noResponse' });
    expect(run({ type: 'ready' }, { type: 'timeout' })).toEqual({ status: 'ready' });
  });
  it('um erro depois de tocar também mostra o aviso', () => {
    expect(run({ type: 'ready' }, { type: 'error', reason: 'unavailable' })).toEqual({ status: 'failed', reason: 'unavailable' });
  });
});
