// A demo do spike: colar o link (como no editor do mundo), ver a plataforma reconhecida e o que o documento guarda, e
// abrir o player como o totem abre: só a mensagem da origem do player e deste iframe vale, a mensagem de "ouvir" se
// repete enquanto carrega, e o prazo cobre o player que não avisa nada.
import { LOADING, PLAYER_TIMEOUT_MS, playbackReducer, type PlaybackState } from '../Domain/Playback';
import { parseVideoLink, sourceOf, SOURCES, type VideoRef } from '../Domain/VideoSource';
import './styles.css';

const EXAMPLES: readonly [string, string][] = [
  ['YouTube', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'],
  ['Vimeo', 'https://vimeo.com/76979871'],
  ['Panda Video', 'https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af'],
  ['Bunny Stream', 'https://player.mediadelivery.net/embed/767357/6dae38a5-9322-401a-a6e6-76e7cbb368dd'],
  ['Bunny (inexistente)', 'https://player.mediadelivery.net/embed/767357/00000000-0000-4000-8000-000000000000'],
  ['Fora da lista', 'https://www.dailymotion.com/video/x8abcd1'],
];
const STATUS: Record<PlaybackState['status'], string> = { loading: 'Carregando o player…', ready: 'O player respondeu: pronto.', failed: '' };
const REASON = {
  unavailable: 'Este vídeo não está disponível (removido, privado ou inexistente). Fale com a sua instituição.',
  embedBlocked: 'O dono do vídeo não liberou este endereço. Fale com a sua instituição.',
  noResponse: 'O player não respondeu: a rede pode estar bloqueando a plataforma, ou o vídeo não existe. Fale com a sua instituição.',
} as const;

// As propriedades do elemento (textContent, onclick, src…), sem o tipo exato: o TypeScript não aguenta a união de
// todas as tags.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function mount(root: HTMLElement, timeoutMs = PLAYER_TIMEOUT_MS): () => void {
  const input = el('input', { id: 'link', type: 'url', placeholder: 'Cole o link do vídeo', autocomplete: 'off' });
  const result = el('p', { className: 'result' });
  result.dataset.testid = 'result';
  const stored = el('pre', { className: 'stored' });
  stored.dataset.testid = 'stored';
  const open = el('button', { type: 'button', textContent: 'Abrir no totem', disabled: true });
  const stage = el('section', { className: 'stage', hidden: true });
  const examples = el('div', { className: 'examples' }, ...EXAMPLES.map(([label, link]) => el('button', { type: 'button', textContent: label, onclick: () => ((input.value = link), recognize()) })));
  let current: VideoRef | null = null;
  let stop = () => {};

  function recognize() {
    stop();
    stage.hidden = true;
    current = parseVideoLink(input.value);
    open.disabled = current === null;
    result.className = `result ${current ? 'ok' : 'no'}`;
    result.textContent = current
      ? `Reconhecido: ${sourceOf(current).label}. O documento guarda só isto:`
      : `Recusado, sem gravar nada. Aceitos: ${SOURCES.map((s) => s.label).join(', ')}.`;
    stored.textContent = current ? JSON.stringify({ video: current }, null, 2) : '';
  }

  function play(ref: VideoRef) {
    stop();
    const source = sourceOf(ref);
    const frame = el('iframe', {
      src: source.embedUrl(ref, window.location.origin),
      title: `Vídeo do totem (${source.label})`,
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
      allowFullscreen: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    const status = el('p', { className: 'status', role: 'status' });
    status.dataset.testid = 'status';
    const log = el('ol', { className: 'log' });
    stage.replaceChildren(el('div', { className: 'frame' }, frame), status, el('h3', { textContent: 'Sinais lidos pela estratégia' }), log);
    stage.hidden = false;
    let state: PlaybackState = LOADING;
    const t0 = performance.now();
    const render = () => {
      stage.dataset.status = state.status;
      if (state.status !== 'failed') return void (status.textContent = STATUS[state.status]);
      const watch = source.watchUrl(ref);
      status.replaceChildren(REASON[state.reason], ...(watch ? [' ', el('a', { href: watch, target: '_blank', rel: 'noopener noreferrer', textContent: `Abrir no ${source.label}` })] : []));
      frame.remove();
    };
    const dispatch = (event: Parameters<typeof playbackReducer>[1], what: string) => {
      log.append(el('li', { textContent: `${Math.round(performance.now() - t0)} ms: ${what}` }));
      state = playbackReducer(state, event);
      render();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== source.playerOrigin(ref) || e.source !== frame.contentWindow) return;
      const signal = source.read(e.data);
      if (signal) dispatch(signal, signal.type === 'ready' ? 'pronto' : `erro (${signal.reason})`);
    };
    window.addEventListener('message', onMessage);
    const listen = source.listenMessage(ref);
    const every = listen ? window.setInterval(() => state.status === 'loading' && frame.contentWindow?.postMessage(listen, source.playerOrigin(ref)), 250) : 0;
    const timer = window.setTimeout(() => dispatch({ type: 'timeout' }, 'prazo vencido'), timeoutMs);
    render();
    stop = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(every);
      window.clearTimeout(timer);
    };
  }

  input.addEventListener('input', recognize);
  open.addEventListener('click', () => current && play(current));
  root.replaceChildren(
    el('h1', { textContent: 'Totem de vídeo além do YouTube' }),
    el('p', { className: 'lead', textContent: 'Cole o link de um vídeo do YouTube, do Vimeo, do Panda Video ou do Bunny Stream, como o master faz no editor do mundo. Ou use um exemplo público:' }),
    examples,
    el('label', { htmlFor: 'link', textContent: 'Link do vídeo' }),
    input,
    result,
    stored,
    open,
    stage,
  );
  return () => stop();
}

const root = document.getElementById('app');
if (root) mount(root);
