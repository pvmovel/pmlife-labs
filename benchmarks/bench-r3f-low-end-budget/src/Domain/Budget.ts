// O orçamento de desempenho (US56) e a conferência de uma rodada contra ele. TypeScript puro. Os números iniciais são
// as decisões de 2026-11-13 (30 FPS no mínimo, meta de 60, até 100 draw calls no celular); os finais saem das medições
// nos aparelhos de referência (results/).
import type { FrameSummary } from './FrameStats';

export type DeviceClass = 'phone' | 'desktop';

export interface PerformanceBudget {
  fpsMin: number;
  fpsTarget: number;
  drawCalls: Record<DeviceClass, number>;
  /** MB baixados no primeiro acesso (com a compressão do servidor). */
  firstLoadMB: number;
  /** Memória do JavaScript (quando o navegador informa). */
  heapMB: number;
}

export const DEFAULT_BUDGET: PerformanceBudget = {
  fpsMin: 30,
  fpsTarget: 60,
  drawCalls: { phone: 100, desktop: 200 },
  firstLoadMB: 3,
  heapMB: 150,
};

export interface RunMeasure {
  frames: FrameSummary;
  drawCalls: { median: number; max: number };
  heapMB: number | null;
}

export interface BudgetCheck {
  metric: 'fps' | 'fpsTarget' | 'drawCalls' | 'firstLoadMB' | 'heapMB';
  value: number;
  limit: number;
  ok: boolean;
  /** `required`: reprova o aparelho; `goal`: só informa (a meta de 60 FPS). */
  level: 'required' | 'goal';
}

/** Celular é o aparelho de toque com a tela estreita; o resto conta como computador. */
export function classifyDevice(input: { touch: boolean; shortSide: number }): DeviceClass {
  return input.touch && input.shortSide < 900 ? 'phone' : 'desktop';
}

/**
 * Confere uma rodada: o FPS mediano contra o mínimo e a meta, os draw calls (o máximo da rodada) contra o limite da
 * classe, e a memória quando houver. Os MB do primeiro acesso são da página, não da rodada: ficam em `checkFirstLoad`.
 */
export function evaluateRun(run: RunMeasure, device: DeviceClass, budget: PerformanceBudget = DEFAULT_BUDGET): BudgetCheck[] {
  const checks: BudgetCheck[] = [
    { metric: 'fps', value: run.frames.fpsMedian, limit: budget.fpsMin, ok: run.frames.fpsMedian >= budget.fpsMin, level: 'required' },
    { metric: 'fpsTarget', value: run.frames.fpsMedian, limit: budget.fpsTarget, ok: run.frames.fpsMedian >= budget.fpsTarget * 0.95, level: 'goal' },
    { metric: 'drawCalls', value: run.drawCalls.max, limit: budget.drawCalls[device], ok: run.drawCalls.max <= budget.drawCalls[device], level: 'required' },
  ];
  if (run.heapMB !== null) checks.push({ metric: 'heapMB', value: run.heapMB, limit: budget.heapMB, ok: run.heapMB <= budget.heapMB, level: 'required' });
  return checks;
}

export function checkFirstLoad(transferMB: number, budget: PerformanceBudget = DEFAULT_BUDGET): BudgetCheck {
  return { metric: 'firstLoadMB', value: transferMB, limit: budget.firstLoadMB, ok: transferMB <= budget.firstLoadMB, level: 'required' };
}

/** A rodada cabe no orçamento quando nenhuma conferência obrigatória falha. */
export function withinBudget(checks: readonly BudgetCheck[]): boolean {
  return checks.every((c) => c.ok || c.level === 'goal');
}
