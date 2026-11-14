// A página do benchmark (US56): o modelo do aparelho, o botão Medir, as rodadas em sequência (cada uma num Canvas novo,
// para não herdar shaders nem DPR da anterior) e o resultado em tabela e em JSON. Parâmetros na URL, para o e2e e para
// medir uma variação: ?s=20 (segundos), ?aquecimento=2, ?rodadas=curso:fixo,estresse:adaptativo, ?camera=orbital,
// ?sombra=0, ?sombraAvatar=contact|none, ?monitor=forcado, ?auto=1 (começa sozinho) e, só para o e2e, ?custoMp=120
// (custo simulado de preenchimento por megapixel).
import { useMemo, useRef, useState } from 'react';
import { checkFirstLoad, withinBudget, DEFAULT_BUDGET } from '../Domain/Budget';
import { benchCity, type ScenarioId } from '../Domain/Scenario';
import { BenchCanvas, type CameraMode, type Quality, type RunOptions } from './Engine3D/BenchCanvas';
import type { AvatarShadow } from './Engine3D/BenchScene';
import type { ProbeData } from './Engine3D/Probe';
import { deviceInfo, heapMB, pageTransferMB } from './device';
import { useI18n } from './i18n/I18n';
import { benchReport, resultFileName, runReport, type BenchReport, type RunReport } from './report';

declare global {
  interface Window {
    __result?: BenchReport;
  }
}

const MODEL_KEY = 'pmlife.bench.model';
const DEFAULT_RUNS = 'curso:fixo,curso:adaptativo,estresse:fixo,estresse:adaptativo';

interface Plan {
  runs: { scenario: ScenarioId; quality: Quality }[];
  seconds: number;
  warmupS: number;
  camera: CameraMode;
  shadows: boolean;
  avatarShadow: AvatarShadow;
  forceMonitor: boolean;
  fillCostMs: number;
  auto: boolean;
}

function readPlan(search: string): Plan {
  const q = new URLSearchParams(search);
  const num = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(q.get(key));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const runs = (q.get('rodadas') ?? DEFAULT_RUNS)
    .split(',')
    .map((r) => r.split(':'))
    .filter(([s, k]) => (s === 'curso' || s === 'estresse') && (k === 'fixo' || k === 'adaptativo'))
    .map(([s, k]) => ({ scenario: s as ScenarioId, quality: k as Quality }));
  const shadow = q.get('sombraAvatar');
  return {
    runs: runs.length ? runs : readPlan('').runs,
    seconds: num('s', 20, 2, 120),
    warmupS: num('aquecimento', 2, 0, 60),
    camera: q.get('camera') === 'orbital' ? 'orbital' : 'avatar',
    shadows: q.get('sombra') !== '0',
    avatarShadow: shadow === 'contact' || shadow === 'none' ? shadow : 'blob',
    forceMonitor: q.get('monitor') === 'forcado',
    fillCostMs: num('custoMp', 0, 0, 500),
    auto: q.get('auto') === '1',
  };
}

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function storedModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const { t, language, setLanguage } = useI18n();
  const initial = useMemo(() => readPlan(window.location.search), []);
  const [seconds, setSeconds] = useState(initial.seconds);
  const [model, setModel] = useState(storedModel);
  const [current, setCurrent] = useState<number | null>(initial.auto ? 0 : null);
  const [report, setReport] = useState<BenchReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [dprLive, setDprLive] = useState<number | null>(null);
  const runsDone = useRef<RunReport[]>([]);
  const dprs = useRef<number[]>([]);
  const webgl = useMemo(hasWebGL, []);
  const plan = { ...initial, seconds };

  const start = () => {
    try {
      localStorage.setItem(MODEL_KEY, model);
    } catch {
      /* sem armazenamento: o modelo só não fica lembrado */
    }
    runsDone.current = [];
    dprs.current = [];
    setReport(null);
    setCopied(false);
    setCurrent(0);
  };

  const finish = (index: number, data: ProbeData) => {
    const run = plan.runs[index];
    const device = deviceInfo(model);
    if (dprs.current.length === 0) dprs.current.push(window.__bench?.dpr ?? window.devicePixelRatio);
    dprs.current.push(window.__bench?.dpr ?? dprs.current[dprs.current.length - 1]);
    runsDone.current.push(
      runReport({ scenario: run.scenario, quality: run.quality, camera: plan.camera, shadows: plan.shadows, avatarShadow: plan.avatarShadow, simulatedFillCostMs: plan.fillCostMs }, data, dprs.current, heapMB(), device),
    );
    dprs.current = [];
    if (index + 1 < plan.runs.length) {
      setCurrent(index + 1);
      return;
    }
    const result = benchReport(device, pageTransferMB(), runsDone.current);
    window.__result = result;
    setReport(result);
    setCurrent(null);
  };

  const options: RunOptions | null =
    current === null
      ? null
      : {
          city: benchCity(plan.runs[current].scenario),
          quality: plan.runs[current].quality,
          camera: plan.camera,
          shadows: plan.shadows,
          avatarShadow: plan.avatarShadow,
          warmupS: plan.warmupS,
          seconds: plan.seconds,
          forceMonitor: plan.forceMonitor,
          fillCostMs: plan.fillCostMs,
        };

  const json = report ? JSON.stringify(report, null, 2) : '';
  const file = resultFileName(model);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">
          {t('nav.home')}
        </a>
        <a className="btn" href="../../../catalogo/bench-r3f-low-end-budget/">
          {t('nav.docs')}
        </a>
        <button type="button" onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}>
          {t('page.language')}
        </button>
      </nav>
      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      {!webgl ? (
        <p className="error" role="alert">
          {t('error.webgl')}
        </p>
      ) : (
        <>
          <section className="card form" aria-label={t('form.model')}>
            <label>
              {t('form.model')}
              <input data-testid="model" value={model} placeholder={t('form.modelHint')} onChange={(e) => setModel(e.target.value)} disabled={current !== null} />
            </label>
            <label>
              {t('form.seconds')}
              <input data-testid="seconds" type="number" min={5} max={120} value={seconds} onChange={(e) => setSeconds(Math.max(5, Math.min(120, Number(e.target.value) || 20)))} disabled={current !== null} />
            </label>
            <p className="muted">{t('form.keep')}</p>
            <div className="actions">
              <button type="button" className="primary" data-testid="start" onClick={start} disabled={current !== null}>
                {report ? t('result.again') : t('form.start', { runs: plan.runs.length, total: plan.runs.length * (plan.seconds + plan.warmupS) })}
              </button>
            </div>
          </section>

          <section className="card" aria-live="polite">
            <p data-testid="status" className="muted">
              {options && current !== null
                ? t('run.progress', { n: current + 1, total: plan.runs.length, scenario: t(`scenario.${options.city.id}`), quality: t(`quality.${options.quality}`) })
                : t('run.idle')}
            </p>
            {options && current !== null && (
              <div className="scene" data-testid="scene" style={{ marginTop: 12 }}>
                <div className="live" data-testid="live" aria-hidden="true">
                  DPR {dprLive ?? '…'}
                </div>
                <BenchCanvas
                  key={current}
                  options={options}
                  onDone={(data) => finish(current, data)}
                  onDpr={(d) => {
                    dprs.current.push(d);
                    setDprLive(d);
                  }}
                />
              </div>
            )}
          </section>

          {report && <Result report={report} json={json} file={file} copied={copied} onCopy={copy} onDownload={download} />}
        </>
      )}
    </main>
  );
}

function Result({ report, json, file, copied, onCopy, onDownload }: { report: BenchReport; json: string; file: string; copied: boolean; onCopy: () => void; onDownload: () => void }) {
  const { t } = useI18n();
  const load = checkFirstLoad(report.firstLoad.value, DEFAULT_BUDGET);
  return (
    <section className="card" data-testid="result">
      <h2>{t('result.title')}</h2>
      <p className={load.ok ? 'muted' : 'fail'}>{t('result.firstLoad', { mb: load.value, limit: load.limit })}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('result.scenario')}</th>
              <th>{t('result.quality')}</th>
              <th>{t('result.fps')}</th>
              <th>{t('result.low')}</th>
              <th>{t('result.frame')}</th>
              <th>{t('result.calls')}</th>
              <th>{t('result.dpr')}</th>
              <th>{t('result.heap')}</th>
              <th>{t('result.verdict')}</th>
            </tr>
          </thead>
          <tbody>
            {report.runs.map((r, i) => {
              const ok = withinBudget(r.checks);
              const goal = r.checks.find((c) => c.metric === 'fpsTarget');
              return (
                <tr key={i} data-testid={`run-${i}`} data-ok={ok}>
                  <td>{t(`scenario.${r.scenario}`)}</td>
                  <td>{t(`quality.${r.quality}`)}</td>
                  <td>{r.frames.fpsMedian}</td>
                  <td>{r.frames.fpsLow1}</td>
                  <td>{r.frames.frameMsP95}</td>
                  <td>{r.drawCalls.max}</td>
                  <td>
                    {r.dpr.start} ➔ {r.dpr.end}
                  </td>
                  <td>{r.heapMB ?? '—'}</td>
                  <td>
                    <span className={ok ? 'ok' : 'fail'}>{t(ok ? 'result.pass' : 'result.fail')}</span>
                    {ok && goal && !goal.ok && <span className="goal"> · {t('result.goalMissed')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 16 }}>{t('result.json')}</h2>
      <textarea className="code" data-testid="json" readOnly value={json} aria-label={t('result.json')} />
      <div className="actions">
        <button type="button" className="primary" onClick={onCopy}>
          {t('result.copy')}
        </button>
        <button type="button" onClick={onDownload}>
          {t('result.download', { file })}
        </button>
        {copied && (
          <span role="status" className="muted">
            {t('result.copied')}
          </span>
        )}
      </div>
    </section>
  );
}
