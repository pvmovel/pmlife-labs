import { useMemo, useState } from 'react';
import { LearnerProgress, type ProgressSnapshot, type Promotion } from '../Domain/LearnerProgress';
import { naiveNextIndex } from './naiveLevel';
import { TRACKS, type Track } from './tracks';

const XP_BUTTONS = [100, 500, 3000];

interface TrackState {
  progress: LearnerProgress;
  naiveIndex: number;
  log: string[];
  saved: ProgressSnapshot | null;
}

const fresh = (track: Track): TrackState => ({
  progress: new LearnerProgress('aprendiz-demo', track.ladder),
  naiveIndex: 0,
  log: [],
  saved: null,
});

/** Uma linha por promoção, em ordem: nenhum nível é pulado no histórico. */
const describe = (p: Promotion, xp: number): string[] => {
  if (p.promotions.length === 0) return [`+${xp} XP (continua em ${p.to.label})`];
  const steps = [p.from, ...p.promotions];
  return [`+${xp} XP`, ...p.promotions.map((to, i) => `   ↳ promovido de ${steps[i].label} para ${to.label}`)];
};

export function App() {
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [states, setStates] = useState<Record<string, TrackState>>(() => Object.fromEntries(TRACKS.map((t) => [t.id, fresh(t)])));
  const track = useMemo(() => TRACKS.find((t) => t.id === trackId)!, [trackId]);
  const state = states[trackId];
  const { progress } = state;

  /** Aplica uma mudança no estado da trilha atual sem mutar o objeto anterior. */
  const update = (fn: (draft: LearnerProgress, s: TrackState) => Partial<TrackState>) => {
    const draft = LearnerProgress.restore(progress.toSnapshot(), track.ladder);
    const patch = fn(draft, state);
    setStates({ ...states, [trackId]: { ...state, progress: draft, ...patch } });
  };

  const grant = (xp: number, label?: string, questId?: string) =>
    update((draft, s) => {
      if (questId) {
        const promotion = draft.completeQuest(questId, xp);
        if (!promotion) return { log: [`"${label}" já foi concluída: nenhum XP somado (idempotência)`, ...s.log] };
        return { naiveIndex: naiveNextIndex(track.ladder, s.naiveIndex, draft.xp), log: [`Missão "${label}"`, ...describe(promotion, xp), ...s.log] };
      }
      const promotion = draft.addExperience(xp);
      return { naiveIndex: naiveNextIndex(track.ladder, s.naiveIndex, draft.xp), log: [...describe(promotion, xp), ...s.log] };
    });

  const levels = track.ladder.all();
  const currentIndex = track.ladder.indexOf(progress.level);
  const naiveLevel = levels[state.naiveIndex];
  const pct = Math.round(progress.progressToNext * 100);

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">← PMLife Labs</a>
        <a className="btn" href="../../../catalogo/poc-domain-driven-gamification-ts/">Documentação</a>
      </nav>
      <p className="eyebrow">PoC · Motor de gamificação</p>
      <h1>Qualquer trilha, a mesma regra de progressão</h1>
      <p className="lead">Os níveis vêm de um arquivo de conteúdo. Troque de trilha: o motor é o mesmo, sem nenhuma linha de código nova.</p>

      <div className="group" role="group" aria-label="Trilha">
        {TRACKS.map((t) => (
          <button key={t.id} type="button" aria-pressed={t.id === trackId} onClick={() => setTrackId(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="status">
          <div>
            <span className="muted">Nível atual</span>
            <strong className="level" data-testid="level">{progress.level.label}</strong>
          </div>
          <div className="right">
            <span className="muted">XP acumulado</span>
            <strong className="xp" data-testid="xp">{progress.xp}</strong>
          </div>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">{progress.nextLevel ? `${pct}% até ${progress.nextLevel.label} (${progress.nextLevel.minXp} XP)` : 'Topo da trilha alcançado'}</p>
        <ol className="ladder">
          {levels.map((l, i) => (
            <li key={l.id} className={i <= currentIndex ? 'done' : ''}>
              <span>{l.label}</span>
              <small>{l.minXp} XP</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Ganhar XP</h2>
        <div className="group">
          {XP_BUTTONS.map((xp) => (
            <button key={xp} type="button" onClick={() => grant(xp)}>
              +{xp} XP
            </button>
          ))}
        </div>
        <h2>Concluir missões</h2>
        <div className="group">
          {track.quests.map((q) => (
            <button key={q.id} type="button" className={progress.completedQuests.includes(q.id) ? 'quest-done' : ''} onClick={() => grant(q.xp, q.label, q.id)}>
              {progress.completedQuests.includes(q.id) ? '✓ ' : ''}
              {q.label} (+{q.xp})
            </button>
          ))}
        </div>
      </section>

      <section className="card compare">
        <h2>Por que a regra importa</h2>
        <div className="cols">
          <div>
            <span className="muted">Este motor (nível derivado do XP)</span>
            <strong>{progress.level.label}</strong>
          </div>
          <div className={naiveLevel.id !== progress.level.id ? 'wrong' : ''}>
            <span className="muted">If/else que sobe um nível por vez</span>
            <strong data-testid="naive-level">{naiveLevel.label}</strong>
          </div>
        </div>
        <p className="muted small">Dê +3000 XP de uma vez: o padrão comum de if/else promove só um nível; aqui o aprendiz chega ao nível que o XP manda, com cada promoção registrada em ordem no histórico.</p>
      </section>

      <section className="card">
        <h2>Salvar e restaurar (reidratação)</h2>
        <div className="group">
          <button type="button" onClick={() => setStates({ ...states, [trackId]: { ...state, saved: progress.toSnapshot(), log: ['Progresso salvo (snapshot)', ...state.log] } })}>
            Salvar
          </button>
          <button
            type="button"
            disabled={!state.saved}
            onClick={() => state.saved && setStates({ ...states, [trackId]: { ...state, progress: LearnerProgress.restore(state.saved, track.ladder), log: ['Progresso restaurado do snapshot', ...state.log] } })}
          >
            Restaurar
          </button>
          <button type="button" onClick={() => setStates({ ...states, [trackId]: fresh(track) })}>
            Zerar
          </button>
        </div>
        {state.saved && <pre className="snapshot">{JSON.stringify(state.saved, null, 2)}</pre>}
      </section>

      <section className="card">
        <h2>Histórico</h2>
        {state.log.length === 0 ? <p className="muted small">Nenhuma ação ainda.</p> : (
          <ul className="log" aria-label="Histórico">
            {state.log.slice(0, 10).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
