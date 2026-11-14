// O relatório de uma sessão do benchmark (US56): o aparelho, os MB da página e cada rodada com o resumo e a conferência
// com o orçamento. É o JSON que vai para results/<aparelho>.json.
import { checkFirstLoad, DEFAULT_BUDGET, evaluateRun, type BudgetCheck } from '../Domain/Budget';
import { countSummary, summarizeFrames, type FrameSummary } from '../Domain/FrameStats';
import type { DeviceInfo } from './device';
import type { CameraMode, Quality } from './Engine3D/BenchCanvas';
import type { AvatarShadow } from './Engine3D/BenchScene';
import type { ProbeData } from './Engine3D/Probe';
import type { ScenarioId } from '../Domain/Scenario';

export interface RunReport {
  scenario: ScenarioId;
  quality: Quality;
  camera: CameraMode;
  shadows: boolean;
  avatarShadow: AvatarShadow;
  /** Custo simulado do e2e (ms por megapixel); 0 numa medição de verdade. */
  simulatedFillCostMs: number;
  frames: FrameSummary;
  drawCalls: { median: number; max: number };
  triangles: { median: number; max: number };
  dpr: { start: number; end: number; min: number };
  heapMB: number | null;
  checks: BudgetCheck[];
}

export interface BenchReport {
  schema: 1;
  bench: 'bench-r3f-low-end-budget';
  date: string;
  device: DeviceInfo;
  firstLoad: BudgetCheck;
  runs: RunReport[];
}

export function runReport(
  meta: Pick<RunReport, 'scenario' | 'quality' | 'camera' | 'shadows' | 'avatarShadow' | 'simulatedFillCostMs'>,
  data: ProbeData,
  dprs: readonly number[],
  heap: number | null,
  device: DeviceInfo,
): RunReport {
  const frames = summarizeFrames(data.deltas);
  const drawCalls = countSummary(data.calls);
  const dpr = { start: dprs[0] ?? 1, end: dprs[dprs.length - 1] ?? 1, min: dprs.length ? Math.min(...dprs) : 1 };
  return { ...meta, frames, drawCalls, triangles: countSummary(data.triangles), dpr, heapMB: heap, checks: evaluateRun({ frames, drawCalls, heapMB: heap }, device.class, DEFAULT_BUDGET) };
}

export function benchReport(device: DeviceInfo, transferMB: number, runs: RunReport[]): BenchReport {
  return { schema: 1, bench: 'bench-r3f-low-end-budget', date: new Date().toISOString(), device, firstLoad: checkFirstLoad(transferMB), runs };
}

/** Nome do arquivo em results/: o modelo do aparelho em minúsculas, só letras, números e hífen. */
export function resultFileName(model: string): string {
  const slug = model
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'aparelho'}.json`;
}
