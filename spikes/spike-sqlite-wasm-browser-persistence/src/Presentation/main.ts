// Demo: usa só o Port (load/save). Qual implementação veio (SQLite + OPFS ou memória) é decidido em createProgressRepository.
import './styles.css';
import type { ProgressSnapshot } from '../Domain/ProgressSnapshot';
import { createProgressRepository } from '../Infrastructure/createProgressRepository';

const TRACK = 'culinaria';
const XP_PER_MISSION = 150;

const $ = <T extends HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`)!;
const set = (id: string, text: string) => ($(id).textContent = text);

const storage = await createProgressRepository({ simulateNoOpfs: new URLSearchParams(location.search).has('sem-opfs') });
const repo = storage.repository;

if (storage.kind === 'opfs') {
  const { info } = storage;
  $('mode').dataset.mode = 'opfs';
  set('mode', 'OPFS (persistente)');
  set('sqlite-version', info.sqliteVersion);
  set(
    'schema',
    `versão ${info.schema?.to}` +
      (info.schema?.applied.length ? ` (migrations aplicadas agora: ${info.schema.applied.join(', ')})` : ' (nada a migrar)'),
  );
  set('timings', `WASM ${info.timings.wasm} ms · VFS ${info.timings.vfs} ms · abrir + migrar ${info.timings.openAndMigrate} ms`);
} else {
  $('mode').dataset.mode = 'memory';
  set('mode', 'Memória (não persiste)');
  const w = $('warning');
  w.textContent = `Sem armazenamento persistente (${storage.reason}): o progresso fica só nesta aba e some ao recarregar.`;
  w.hidden = false;
}

let progress: ProgressSnapshot = { trackId: TRACK, xp: 0, completedMissions: [] };

function render(): void {
  set('xp', String(progress.xp));
  set('missions', progress.completedMissions.length ? progress.completedMissions.join(', ') : 'nenhuma');
}

const t0 = performance.now();
progress = (await repo.load(TRACK)) ?? progress;
set('load-time', `${Math.round((performance.now() - t0) * 100) / 100} ms`);
render();

const complete = $<HTMLButtonElement>('complete');
const clear = $<HTMLButtonElement>('clear');
const bench = $<HTMLButtonElement>('bench');
complete.disabled = clear.disabled = false;
bench.disabled = storage.kind !== 'opfs';

complete.onclick = async () => {
  const next = `missao-${progress.completedMissions.length + 1}`;
  const updated = { trackId: TRACK, xp: progress.xp + XP_PER_MISSION, completedMissions: [...progress.completedMissions, next] };
  await repo.save(updated);
  progress = updated;
  render();
};

clear.onclick = async () => {
  progress = { trackId: TRACK, xp: 0, completedMissions: [] };
  if (storage.kind === 'opfs') await storage.sqlite.clear();
  else await repo.save(progress);
  render();
};

$('reload').onclick = () => location.reload();

bench.onclick = async () => {
  if (storage.kind !== 'opfs') return;
  bench.disabled = true;
  const r = await storage.sqlite.bench();
  const dl = $('bench-result');
  dl.innerHTML = '';
  for (const [k, v] of [
    [`Inserir ${r.rows} linhas (1 transação)`, `${r.insertBatchMs} ms`],
    [`Ler ${r.rows} linhas`, `${r.readAllMs} ms`],
    [`Gravação avulsa (média de ${r.singleWrites})`, `${r.singleWriteAvgMs} ms`],
  ]) {
    dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
  }
  dl.hidden = false;
  dl.dataset.json = JSON.stringify(r);
  bench.disabled = false;
};

document.body.dataset.ready = 'true';
