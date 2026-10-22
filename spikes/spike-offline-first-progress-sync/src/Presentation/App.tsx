import { useMemo, useState } from 'react';
import { createDemo, type DemoDevice, type LinkMode } from './di/demo';

const LABEL: Record<DemoDevice['id'], string> = { phone: '📱 Celular', pc: '💻 Computador' };
const MODES: { mode: LinkMode; label: string }[] = [
  { mode: 'online', label: 'Online' },
  { mode: 'offline', label: 'Offline' },
  { mode: 'lostReply', label: 'Perde a resposta' },
];

export function App() {
  const demo = useMemo(createDemo, []);
  const [, setTick] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const refresh = () => setTick((t) => t + 1);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  const sync = async (d: DemoDevice) => {
    const r = await d.progress.sync();
    note(`${LABEL[d.id]}: ${r.status === 'synced' ? 'sincronizado' : 'sem resposta do servidor; a fila continua'}`);
    refresh();
  };
  const setMode = async (d: DemoDevice, mode: LinkMode) => {
    d.link.mode = mode;
    refresh();
    // Voltou a rede: envia o que ficou na fila (no navegador, o evento "online" faz isso).
    if (mode === 'online') await sync(d);
  };
  const complete = (d: DemoDevice, questId: string) => {
    if (d.guest) {
      if (!d.guest.includes(questId)) d.guest.push(questId);
    } else {
      d.progress.complete(questId, new Date());
    }
    refresh();
  };
  const signIn = async (d: DemoDevice) => {
    const n = d.progress.adoptGuestProgress(d.guest ?? [], new Date());
    d.guest = null;
    note(`${LABEL[d.id]}: entrou na conta e levou ${n} missão(ões) de visitante`);
    await sync(d);
  };

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">← PMLife Labs</a>
        <a className="btn" href="../../../catalogo/spike-offline-first-progress-sync/">Documentação</a>
      </nav>
      <p className="eyebrow">Spike · sincronização offline-first</p>
      <h1>O mesmo progresso em dois aparelhos</h1>
      <p className="lead">
        Conclua missões em cada aparelho, ponha um deles offline ou faça a resposta do servidor se perder. As missões valem na hora no aparelho,
        ficam numa fila e são enviadas quando a rede volta. O XP é sempre a soma das missões concluídas: nunca conta em dobro.
      </p>

      <div className="grid">
        {demo.devices.map((d) => {
          const s = d.progress.state;
          const guestXp = d.guest ? d.guest.reduce((xp, id) => xp + demo.catalog.reward(id), 0) : 0;
          return (
            <section key={d.id} className="card" data-testid={`device-${d.id}`} data-xp={d.guest ? guestXp : s.xp} data-pending={s.pending} data-completed={(d.guest ?? s.completed).join(',')}>
              <h2>{LABEL[d.id]}</h2>
              {d.guest ? (
                <p className="muted">Visitante: o progresso fica só neste navegador.</p>
              ) : (
                <div className="group" role="group" aria-label={`Rede do ${LABEL[d.id]}`}>
                  {MODES.map((m) => (
                    <button key={m.mode} type="button" aria-pressed={d.link.mode === m.mode} onClick={() => void setMode(d, m.mode)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <dl className="pairs">
                <dt>XP</dt>
                <dd>{d.guest ? guestXp : s.xp}</dd>
                <dt>Na fila</dt>
                <dd>{d.guest ? '—' : s.pending}</dd>
              </dl>
              <ul className="quests">
                {demo.catalog.quests.map((q) => {
                  const done = (d.guest ?? s.completed).includes(q.id);
                  return (
                    <li key={q.id}>
                      <button type="button" data-quest={q.id} disabled={done} onClick={() => complete(d, q.id)}>
                        {done ? '✓ ' : ''}
                        {q.title} <small>+{q.rewardXp} XP</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {d.guest ? (
                <button type="button" className="primary" onClick={() => void signIn(d)}>
                  Entrar na conta
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => void sync(d)}>
                  Sincronizar
                </button>
              )}
            </section>
          );
        })}

        <section className="card server" data-testid="server" data-rows={demo.server.rows.size} data-received={demo.server.received}>
          <h2>🗄️ Servidor</h2>
          <dl className="pairs">
            <dt>Lotes recebidos</dt>
            <dd>{demo.server.received}</dd>
            <dt>Linhas gravadas</dt>
            <dd>{demo.server.rows.size}</dd>
          </dl>
          <ul className="rows">
            {[...demo.server.rows.values()].map((r) => (
              <li key={r.questId}>{demo.catalog.quests.find((q) => q.id === r.questId)?.title}</li>
            ))}
          </ul>
          <h3>O que aconteceu</h3>
          <ol className="log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
