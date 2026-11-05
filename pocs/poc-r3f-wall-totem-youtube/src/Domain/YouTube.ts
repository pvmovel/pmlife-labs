// Domain: o vídeo do totem. O documento guarda só o ID do vídeo (11 caracteres), nunca o link colado nem HTML; o
// endereço do player é montado a partir dele, no domínio sem cookies de rastreamento antes do play
// (youtube-nocookie.com). TypeScript puro.

/** O formato do ID de um vídeo do YouTube. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Os endereços aceitos ao colar um link. */
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be']);

/**
 * Extrai o ID do vídeo de um link do YouTube: `youtu.be/<id>`, `youtube.com/watch?v=<id>` e `/embed/<id>` (também em
 * `youtube-nocookie.com`). Parâmetros como `si` (compartilhamento) e `t` (tempo) são descartados.
 *
 * @param link - O que o master colou (com ou sem `https://`).
 * @returns O ID, ou `null` se o link não é de um vídeo do YouTube.
 */
export function extractVideoId(link: string): string | null {
  const text = link.trim();
  if (text === '' || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host.endsWith('youtu.be')) id = parts.length === 1 ? parts[0] : null;
  else if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v');
  else if (parts.length === 2 && (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live')) id = parts[1];
  return id !== null && VIDEO_ID.test(id) ? id : null;
}

/**
 * O endereço do player, sem cookies de rastreamento antes do play. `enablejsapi=1` faz o player avisar a página
 * (pronto ou erro) por `postMessage`, sem carregar nenhum script do YouTube na página.
 *
 * @param id - O ID do vídeo (já conferido).
 * @param origin - A origem da página (o player só manda mensagens para ela).
 * @returns O endereço do `<iframe>`.
 */
export function embedUrl(id: string, origin: string): string {
  if (!VIDEO_ID.test(id)) throw new Error(`ID de vídeo inválido: ${id}`);
  const params = new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1', origin });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** O link para abrir o vídeo no YouTube (o plano B quando o player não funciona aqui). */
export const watchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
