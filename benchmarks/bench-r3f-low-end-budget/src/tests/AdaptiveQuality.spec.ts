import { describe, expect, it } from 'vitest';
import { DPR_FLOOR, dprFor, dprRange, monitorBounds, monitorEnabled } from '../Domain/AdaptiveQuality';

describe('a política da qualidade adaptativa (US56)', () => {
  it('a faixa vai do piso ao DPR do aparelho, no máximo 2', () => {
    expect(dprRange(3)).toEqual({ floor: DPR_FLOOR, max: 2 });
    expect(dprRange(1.5)).toEqual({ floor: DPR_FLOOR, max: 1.5 });
    expect(dprRange(0.5)).toEqual({ floor: 0.5, max: 0.5 });
    expect(dprRange(Number.NaN)).toEqual({ floor: DPR_FLOOR, max: 1 });
  });

  it('o fator do monitor vira a resolução, do piso (0) ao teto (1), em passos de 0,05', () => {
    const range = dprRange(2);
    expect(dprFor(1, range)).toBe(2);
    expect(dprFor(0, range)).toBe(0.75);
    expect(dprFor(0.5, range)).toBe(1.4);
    expect(dprFor(7, range)).toBe(2);
    expect(dprFor(-1, range)).toBe(0.75);
  });

  it('Cenário: abaixo de 30 FPS a qualidade cai (o limite inferior do monitor está acima do mínimo do orçamento)', () => {
    const [lower, upper] = monitorBounds(60);
    expect(lower).toBeGreaterThan(30);
    expect(upper).toBeGreaterThan(lower);
    expect(monitorBounds(120)[0]).toBeGreaterThanOrEqual(60);
  });

  it('o monitor só mede quando a cena desenha todo quadro (no "demand" leria FPS falso)', () => {
    expect(monitorEnabled('always')).toBe(true);
    expect(monitorEnabled('demand')).toBe(false);
    expect(monitorEnabled('never')).toBe(false);
  });
});
