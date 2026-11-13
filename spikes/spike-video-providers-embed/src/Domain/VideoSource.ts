// As plataformas de vídeo do totem, uma estratégia por plataforma (Open/Closed): uma plataforma nova é um objeto novo
// na lista `SOURCES`, sem mexer nas outras nem na tela. Cada estratégia sabe:
// - reconhecer o link colado e tirar dele só os IDs (o documento nunca guarda o link nem HTML);
// - conferir os IDs guardados (a mesma regra que os validadores do documento aplicam);
// - montar o endereço do player, com o mínimo de rastreamento;
// - de qual origem as mensagens do player valem e como ler o "pronto" e o erro;
// - se existe uma página pública para abrir o vídeo fora do PMLife (o plano B do aviso).
// Os protocolos foram medidos no Chrome com os players reais (scripts/measure.mjs, results/medicao.json).

/** Por que o vídeo não toca: o mesmo vocabulário do totem do YouTube (US38). */
export type PlaybackFailure = 'unavailable' | 'embedBlocked' | 'noResponse';

/** O que o player avisou, já traduzido para a tela. */
export type PlayerSignal = { readonly type: 'ready' } | { readonly type: 'error'; readonly reason: Exclude<PlaybackFailure, 'noResponse'> };

/** O que o documento guarda de um vídeo do YouTube. */
export interface YouTubeRef {
  readonly provider: 'youtube';
  readonly id: string;
}

/** O que o documento guarda de um vídeo do Vimeo: o `hash` é o parâmetro `h` dos vídeos "não listados". */
export interface VimeoRef {
  readonly provider: 'vimeo';
  readonly id: string;
  readonly hash?: string;
}

/** O que o documento guarda de um vídeo do Panda Video: a zona do player (do subdomínio) e o ID externo (UUID). */
export interface PandaRef {
  readonly provider: 'panda';
  readonly zone: string;
  readonly id: string;
}

/** O que o documento guarda de um vídeo do Bunny Stream: a biblioteca e o GUID; `legacy` quando veio do player antigo. */
export interface BunnyRef {
  readonly provider: 'bunny';
  readonly library: string;
  readonly id: string;
  readonly legacy?: true;
}

/** O vídeo de um totem, como o documento guarda. */
export type VideoRef = YouTubeRef | VimeoRef | PandaRef | BunnyRef;

/** As plataformas aceitas. */
export type Provider = VideoRef['provider'];

/** Uma plataforma de vídeo. */
export interface VideoSource<R extends VideoRef = VideoRef> {
  /** O nome guardado no documento. */
  readonly provider: R['provider'];
  /** O nome mostrado ao master. */
  readonly label: string;
  /** Os IDs de um link já aberto (`URL`), ou null se o link não é desta plataforma. */
  parse(url: URL): R | null;
  /** O objeto guardado tem o formato desta plataforma (sem campos a mais). */
  isValid(ref: Readonly<Record<string, unknown>>): boolean;
  /** O endereço do `<iframe>`. */
  embedUrl(ref: R, pageOrigin: string): string;
  /** A origem do player: mensagens de outra origem são ignoradas. */
  playerOrigin(ref: R): string;
  /** A mensagem que a página repete enquanto o vídeo carrega, para o player avisar o erro (null: não precisa). */
  listenMessage(ref: R): string | null;
  /** O "pronto" ou o erro numa mensagem do player (null: a mensagem não interessa). */
  read(data: unknown): PlayerSignal | null;
  /** A página pública do vídeo, ou null se a plataforma não tem (o aviso fica sem o link). */
  watchUrl(ref: R): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A mensagem pode chegar como texto JSON ou como objeto. */
function asObject(data: unknown): Record<string, unknown> | null {
  let m: unknown = data;
  if (typeof data === 'string') {
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return typeof m === 'object' && m !== null && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
}
/** Só as chaves esperadas, com valores de texto (ou `true`, para as marcas). */
function hasOnly(ref: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(ref);
  return required.every((k) => keys.includes(k)) && keys.every((k) => k === 'provider' || required.includes(k) || optional.includes(k));
}
const text = (v: unknown, re: RegExp): boolean => typeof v === 'string' && re.test(v);

// --- YouTube (US38): o mesmo comportamento de hoje ---
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be']);
const YT_ORIGIN = 'https://www.youtube-nocookie.com';

export const youtube: VideoSource<YouTubeRef> = {
  provider: 'youtube',
  label: 'YouTube',
  parse(url) {
    const host = url.hostname;
    if (!YT_HOSTS.has(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host.endsWith('youtu.be')) id = parts.length === 1 ? parts[0] : null;
    else if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v');
    else if (parts.length === 2 && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
    return id !== null && YT_ID.test(id) ? { provider: 'youtube', id } : null;
  },
  isValid: (ref) => hasOnly(ref, ['id']) && text(ref.id, YT_ID),
  embedUrl: (ref, pageOrigin) => `${YT_ORIGIN}/embed/${ref.id}?${new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1', origin: pageOrigin })}`,
  playerOrigin: () => YT_ORIGIN,
  listenMessage: () => JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
  read(data) {
    const m = asObject(data);
    if (m?.event === 'onReady') return { type: 'ready' };
    if (m?.event === 'onError' && typeof m.info === 'number') return { type: 'error', reason: m.info === 101 || m.info === 150 ? 'embedBlocked' : 'unavailable' };
    return null;
  },
  watchUrl: (ref) => `https://www.youtube.com/watch?v=${encodeURIComponent(ref.id)}`,
};

// --- Vimeo: o player avisa {"event":"ready"} sozinho; o erro chega como {"event":"error","data":{"name":...}} ---
const VIMEO_ID = /^[1-9][0-9]{0,11}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;
const VIMEO_ORIGIN = 'https://player.vimeo.com';

export const vimeo: VideoSource<VimeoRef> = {
  provider: 'vimeo',
  label: 'Vimeo',
  parse(url) {
    const host = url.hostname;
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | undefined;
    let hash: string | null | undefined;
    if (host === 'player.vimeo.com') {
      if (parts.length === 2 && parts[0] === 'video') [id, hash] = [parts[1], url.searchParams.get('h')];
    } else if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      // vimeo.com/<id>, vimeo.com/<id>/<hash>, o link do painel (manage/videos/<id>[/<hash>]), canais e vitrines.
      const rest = parts[0] === 'manage' && parts[1] === 'videos' ? parts.slice(2)
        : parts[0] === 'channels' && parts.length >= 3 ? parts.slice(2)
        : parts[0] === 'showcase' && parts[2] === 'video' ? parts.slice(3)
        : parts;
      if (rest.length === 1 || rest.length === 2) [id, hash] = [rest[0], rest[1] ?? url.searchParams.get('h')];
    }
    if (id === undefined || !VIMEO_ID.test(id)) return null;
    if (hash === null || hash === undefined || hash === '') return { provider: 'vimeo', id };
    return VIMEO_HASH.test(hash) ? { provider: 'vimeo', id, hash } : null;
  },
  isValid: (ref) => hasOnly(ref, ['id'], ['hash']) && text(ref.id, VIMEO_ID) && (ref.hash === undefined || text(ref.hash, VIMEO_HASH)),
  // dnt=1: sem os cookies de sessão e de métricas (vuid, player); medido: ficam só os do Cloudflare contra robôs.
  embedUrl: (ref) => `${VIMEO_ORIGIN}/video/${ref.id}?${new URLSearchParams({ ...(ref.hash ? { h: ref.hash } : {}), dnt: '1', playsinline: '1' })}`,
  playerOrigin: () => VIMEO_ORIGIN,
  listenMessage: () => JSON.stringify({ method: 'addEventListener', value: 'error' }),
  read(data) {
    const m = asObject(data);
    // O Bunny (player.js) também manda event "ready": a origem já separa, e a leitura não confunde (sem `context`).
    if (!m || 'context' in m) return null;
    if (m.event === 'ready') return { type: 'ready' };
    if (m.event === 'error') {
      const name = typeof m.data === 'object' && m.data !== null ? (m.data as { name?: unknown }).name : undefined;
      return { type: 'error', reason: name === 'PrivacyError' ? 'embedBlocked' : 'unavailable' };
    }
    return null;
  },
  watchUrl: (ref) => `https://vimeo.com/${ref.id}${ref.hash ? `/${ref.hash}` : ''}`,
};

// --- Panda Video: o player avisa {"message":"panda_ready"}; não manda erro (vídeo inexistente toca o aviso dele) ---
const PANDA_ZONE = /^[0-9a-z]{8}-[0-9a-z]{3}$/;
const PANDA_HOST = /^player-vz-([0-9a-z]{8}-[0-9a-z]{3})\.tv\.pandavideo\.com\.br$/;
const pandaOrigin = (zone: string) => `https://player-vz-${zone}.tv.pandavideo.com.br`;

export const panda: VideoSource<PandaRef> = {
  provider: 'panda',
  label: 'Panda Video',
  parse(url) {
    const zone = PANDA_HOST.exec(url.hostname)?.[1];
    const id = url.searchParams.get('v');
    if (zone === undefined || url.pathname.replace(/\/+$/, '') !== '/embed' || id === null || !UUID.test(id)) return null;
    return { provider: 'panda', zone, id };
  },
  isValid: (ref) => hasOnly(ref, ['zone', 'id']) && text(ref.zone, PANDA_ZONE) && text(ref.id, UUID),
  embedUrl: (ref) => `${pandaOrigin(ref.zone)}/embed/?${new URLSearchParams({ v: ref.id })}`,
  playerOrigin: (ref) => pandaOrigin(ref.zone),
  listenMessage: () => null,
  read(data) {
    const m = asObject(data);
    return m?.message === 'panda_ready' ? { type: 'ready' } : null;
  },
  watchUrl: () => null,
};

// --- Bunny Stream: protocolo player.js; o "ready" chega sozinho; o erro só depois do addEventListener ---
const BUNNY_LIBRARY = /^[1-9][0-9]{0,9}$/;
const BUNNY_HOSTS: Readonly<Record<string, boolean>> = { 'player.mediadelivery.net': false, 'iframe.mediadelivery.net': true };
const bunnyOrigin = (ref: BunnyRef) => `https://${ref.legacy ? 'iframe' : 'player'}.mediadelivery.net`;

export const bunny: VideoSource<BunnyRef> = {
  provider: 'bunny',
  label: 'Bunny Stream',
  parse(url) {
    const legacy = BUNNY_HOSTS[url.hostname];
    if (legacy === undefined) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3 || (parts[0] !== 'embed' && parts[0] !== 'play')) return null;
    const [, library, id] = parts;
    if (!BUNNY_LIBRARY.test(library) || !UUID.test(id)) return null;
    return legacy ? { provider: 'bunny', library, id, legacy: true } : { provider: 'bunny', library, id };
  },
  isValid: (ref) => hasOnly(ref, ['library', 'id'], ['legacy']) && text(ref.library, BUNNY_LIBRARY) && text(ref.id, UUID) && (ref.legacy === undefined || ref.legacy === true),
  embedUrl: (ref) => `${bunnyOrigin(ref)}/embed/${ref.library}/${ref.id}?${new URLSearchParams({ autoplay: 'false', playsinline: 'true' })}`,
  playerOrigin: bunnyOrigin,
  listenMessage: () => JSON.stringify({ context: 'player.js', version: '0.0.11', method: 'addEventListener', value: 'error', listener: 'pmlife-error' }),
  read(data) {
    const m = asObject(data);
    if (m?.context !== 'player.js') return null;
    if (m.event === 'ready') return { type: 'ready' };
    if (m.event === 'error') return { type: 'error', reason: 'unavailable' };
    return null;
  },
  watchUrl: () => null,
};

/** As plataformas aceitas, na ordem em que o editor as lista. */
export const SOURCES: readonly VideoSource[] = [youtube, vimeo, panda, bunny] as readonly VideoSource[];

/** A estratégia de um vídeo guardado. */
export function sourceOf<R extends VideoRef>(ref: R): VideoSource<R> {
  const source = SOURCES.find((s) => s.provider === ref.provider);
  if (!source) throw new Error(`plataforma desconhecida: ${String(ref.provider)}`);
  return source as unknown as VideoSource<R>;
}

/**
 * Os IDs do link colado pelo master, de qualquer plataforma aceita (com ou sem `https://`).
 *
 * @returns O que o documento guarda, ou null: link de outra plataforma, malformado ou com usuário, senha ou porta.
 */
export function parseVideoLink(link: string): VideoRef | null {
  const raw = link.trim();
  if (raw === '' || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.port) return null;
  for (const source of SOURCES) {
    const ref = source.parse(url);
    if (ref) return ref;
  }
  return null;
}

/**
 * O vídeo de um totem salvo, conferido como os validadores do documento conferem. Aceita o formato novo
 * (`video: {provider, ...}`) e o de antes (`videoId`, sempre YouTube, sem conversão).
 *
 * @returns O vídeo, ou o código do erro (o mesmo nos dois validadores).
 */
export function readTotemVideo(totem: Readonly<Record<string, unknown>>): VideoRef | 'VIDEO_MISSING' | 'VIDEO_BOTH' | 'VIDEO_PROVIDER_UNKNOWN' | 'VIDEO_INVALID' {
  const hasNew = 'video' in totem;
  const hasOld = 'videoId' in totem;
  if (hasNew && hasOld) return 'VIDEO_BOTH';
  if (hasOld) return text(totem.videoId, YT_ID) ? { provider: 'youtube', id: totem.videoId as string } : 'VIDEO_INVALID';
  if (!hasNew) return 'VIDEO_MISSING';
  const v = totem.video;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'VIDEO_INVALID';
  const ref = v as Record<string, unknown>;
  const source = SOURCES.find((s) => s.provider === ref.provider);
  if (!source) return 'VIDEO_PROVIDER_UNKNOWN';
  return source.isValid(ref) ? (ref as unknown as VideoRef) : 'VIDEO_INVALID';
}
