// Mede, com os players reais no Chrome, as estratégias de src/Domain/VideoSource.ts (importadas direto: o Node 24
// roda TypeScript). Para cada caso, uma página local abre o iframe montado pela estratégia, repete a mensagem de
// "ouvir" como a tela faz, e registra:
//   - o status HTTP do player e a origem das mensagens;
//   - o primeiro "pronto" ou erro lido pela estratégia (e quanto demorou), ou nada (o aviso pelo prazo);
//   - os cookies gravados antes e depois do play (só domínio e nome, nunca o valor), num Chrome novo por caso.
// Precisa de internet, por isso fica fora do `yarn verify` (o CI não depende da rede de terceiros). Saída:
// results/medicao.json, que o README resume.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { parseVideoLink, sourceOf } from '../src/Domain/VideoSource.ts';

const PORT = 4196;
const ORIGIN = `http://localhost:${PORT}`;
const WAIT_MS = 12_000;
const PLAY_MS = 6_000;

const chrome =
  process.env.CHROME_PATH ??
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!chrome) {
  console.error('ERRO: Chrome/Chromium não encontrado (defina CHROME_PATH).');
  process.exit(1);
}

// Vídeos públicos: o da demo da API do YouTube, o 76979871 do próprio Vimeo, o do exemplo da documentação do Panda
// e o da demo oficial do Bunny (BunnyWay/examples). Os "inexistentes" trocam o ID por um que não existe.
const ZERO = '00000000-0000-4000-8000-000000000000';
const CASES = [
  ['youtube', 'público', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'],
  ['vimeo', 'público', 'https://vimeo.com/76979871'],
  ['vimeo', 'inexistente', 'https://vimeo.com/1'],
  ['panda', 'público', 'https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af'],
  ['panda', 'inexistente', `https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=${ZERO}`],
  ['bunny', 'público', 'https://player.mediadelivery.net/embed/767357/6dae38a5-9322-401a-a6e6-76e7cbb368dd'],
  ['bunny', 'público, player antigo', 'https://iframe.mediadelivery.net/embed/767357/6dae38a5-9322-401a-a6e6-76e7cbb368dd'],
  ['bunny', 'inexistente', `https://player.mediadelivery.net/embed/767357/${ZERO}`],
];

const page = (src, listen) => `<!doctype html><meta charset=utf-8><body style="margin:0">
<iframe id=f src="${src}" style="width:960px;height:540px;border:0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
<script>
window.__log = [];
const t0 = performance.now();
const f = document.getElementById('f');
addEventListener('message', (e) => {
  if (e.source !== f.contentWindow) return;
  window.__log.push({ t: Math.round(performance.now() - t0), origin: e.origin, data: typeof e.data === 'string' ? e.data : JSON.stringify(e.data) });
});
const listen = ${JSON.stringify(listen)};
if (listen) { const timer = setInterval(() => f.contentWindow && f.contentWindow.postMessage(listen, new URL(f.src).origin), 250); setTimeout(() => clearInterval(timer), ${WAIT_MS}); }
</script>`;

let html = '';
const server = http.createServer((_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
});
await new Promise((r) => server.listen(PORT, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookieNames = async (cdp) => (await cdp.send('Storage.getCookies')).cookies.map((c) => `${c.domain} ${c.name}`).sort();

const results = [];
let version = '';
try {
  for (const [provider, kind, link] of CASES) {
    const ref = parseVideoLink(link);
    if (!ref || ref.provider !== provider) throw new Error(`a estratégia não reconheceu ${link}`);
    const source = sourceOf(ref);
    const src = source.embedUrl(ref, ORIGIN);
    html = page(src, source.listenMessage(ref));

    const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    version ||= await browser.version();
    try {
      const tab = await browser.newPage();
      const statuses = [];
      tab.on('response', (r) => {
        if (r.request().resourceType() === 'document' && r.url() === src) statuses.push(r.status());
      });
      const cdp = await tab.createCDPSession();
      await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
      await sleep(WAIT_MS);
      const before = await cookieNames(cdp);
      await tab.mouse.click(480, 270);
      await sleep(PLAY_MS);
      const after = await cookieNames(cdp);
      const log = await tab.evaluate(() => window.__log);

      const fromPlayer = log.filter((m) => m.origin === source.playerOrigin(ref));
      const signals = fromPlayer.map((m) => ({ ...m, signal: source.read(m.data) })).filter((m) => m.signal);
      const first = signals[0];
      results.push({
        provider,
        kind,
        stored: ref,
        embedUrl: src.replace(encodeURIComponent(ORIGIN), 'ORIGEM'),
        playerStatus: statuses[0] ?? null,
        origins: [...new Set(log.map((m) => m.origin))],
        messages: log.length,
        firstSignal: first ? { ...first.signal, afterMs: first.t } : null,
        signals: [...new Set(signals.map((s) => (s.signal.type === 'ready' ? 'ready' : `error:${s.signal.reason}`)))],
        sample: first ? first.data : null,
        cookiesBeforePlay: before,
        cookiesAfterPlay: after,
      });
      console.log(`${provider} (${kind}): HTTP ${statuses[0] ?? '-'}, ${first ? `${first.signal.type}${first.signal.reason ? `:${first.signal.reason}` : ''} em ${first.t} ms` : 'nenhum sinal (aviso pelo prazo)'}, cookies ${after.length}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}

mkdirSync('results', { recursive: true });
writeFileSync('results/medicao.json', `${JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), browser: version, results }, null, 2)}\n`);
console.log('results/medicao.json gravado');
