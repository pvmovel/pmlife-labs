import { describe, expect, it } from 'vitest';
import { countSummary, percentile, summarizeFrames } from '../Domain/FrameStats';

describe('o resumo dos quadros (US56)', () => {
  it('60 quadros de 16,67 ms dão 60 FPS em 1 s', () => {
    const s = summarizeFrames(Array(60).fill(1000 / 60));
    expect(s.frames).toBe(60);
    expect(s.seconds).toBe(1);
    expect(s.fpsAverage).toBe(60);
    expect(s.fpsMedian).toBe(60);
  });

  it('o 1% baixo mostra o engasgo que a média esconde', () => {
    const deltas = [...Array(98).fill(16), 100, 100];
    const s = summarizeFrames(deltas);
    expect(s.fpsMedian).toBeCloseTo(62.5, 1);
    expect(s.fpsLow1).toBeLessThan(30);
    expect(s.frameMsMax).toBe(100);
  });

  it('ignora intervalos inválidos e uma rodada vazia dá zero', () => {
    expect(summarizeFrames([0, -1, Number.NaN, 20]).frames).toBe(1);
    expect(summarizeFrames([]).fpsMedian).toBe(0);
  });

  it('percentil com interpolação e contagens', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([], 50)).toBe(0);
    expect(countSummary([30, 10, 20])).toEqual({ median: 20, max: 30 });
  });
});
