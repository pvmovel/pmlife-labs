import { describe, expect, it } from 'vitest';
import { checkFirstLoad, classifyDevice, DEFAULT_BUDGET, evaluateRun, withinBudget } from '../Domain/Budget';
import { summarizeFrames } from '../Domain/FrameStats';

const run = (fps: number, calls: number, heap: number | null = 80) => ({ frames: summarizeFrames(Array(100).fill(1000 / fps)), drawCalls: { median: calls, max: calls }, heapMB: heap });

describe('o orçamento de desempenho (US56)', () => {
  it('os números decididos em 2026-11-13', () => {
    expect(DEFAULT_BUDGET.fpsMin).toBe(30);
    expect(DEFAULT_BUDGET.fpsTarget).toBe(60);
    expect(DEFAULT_BUDGET.drawCalls.phone).toBe(100);
  });

  it('60 FPS com 40 draw calls no celular: dentro e na meta', () => {
    const checks = evaluateRun(run(60, 40), 'phone');
    expect(withinBudget(checks)).toBe(true);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('35 FPS fica dentro, mas abaixo da meta (que só informa)', () => {
    const checks = evaluateRun(run(35, 40), 'phone');
    expect(withinBudget(checks)).toBe(true);
    expect(checks.find((c) => c.metric === 'fpsTarget')?.ok).toBe(false);
  });

  it('abaixo de 30 FPS, ou 150 draw calls no celular, fica fora; no computador o limite de draw calls é maior', () => {
    expect(withinBudget(evaluateRun(run(25, 40), 'phone'))).toBe(false);
    expect(withinBudget(evaluateRun(run(60, 150), 'phone'))).toBe(false);
    expect(withinBudget(evaluateRun(run(60, 150), 'desktop'))).toBe(true);
  });

  it('sem a memória do navegador, não confere memória; MB do primeiro acesso à parte', () => {
    expect(evaluateRun(run(60, 40, null), 'phone').some((c) => c.metric === 'heapMB')).toBe(false);
    expect(checkFirstLoad(2.4).ok).toBe(true);
    expect(checkFirstLoad(3.5).ok).toBe(false);
  });

  it('celular é toque com a tela estreita; tablet grande e computador contam como computador', () => {
    expect(classifyDevice({ touch: true, shortSide: 393 })).toBe('phone');
    expect(classifyDevice({ touch: true, shortSide: 1024 })).toBe('desktop');
    expect(classifyDevice({ touch: false, shortSide: 768 })).toBe('desktop');
  });
});
