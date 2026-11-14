// A política da qualidade adaptativa (US56), sem React nem three.js. O `PerformanceMonitor` do drei mede o FPS e mexe
// num fator entre 0 e 1; aqui fica o que o fator significa (a resolução entre o piso e o teto) e quando o monitor pode
// medir. Achados que viraram regra:
//  - no frameloop "demand" (a visão orbital parada), a cena só desenha quando algo muda: o monitor leria quase 0 FPS
//    entre dois quadros e baixaria a qualidade à toa. Ele só liga com o frameloop "always";
//  - o `AdaptiveDpr` do drei multiplica sempre o DPR inicial do Canvas (fixo no primeiro valor) e chama o setDpr direto,
//    então desfaz o que o monitor baixou: fica de fora (na visão orbital, a cena já só desenha quando a câmera mexe).

export type Frameloop = 'always' | 'demand' | 'never';

export interface DprRange {
  /** O menor DPR que a cena aceita: abaixo disso os rótulos ficam ilegíveis. */
  floor: number;
  /** O maior: o do aparelho, até 2 (acima de 2 a diferença não se vê e o custo dobra). */
  max: number;
}

/** O piso de DPR do campus. */
export const DPR_FLOOR = 0.75;
/** O teto de DPR (o `dpr={[1, 2]}` de hoje já parava em 2). */
export const DPR_CAP = 2;

/** A faixa de resolução de um aparelho. Num aparelho de DPR menor que o piso, a faixa é só o DPR dele. */
export function dprRange(deviceDpr: number, floor = DPR_FLOOR, cap = DPR_CAP): DprRange {
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const max = Math.min(dpr, cap);
  return { floor: Math.min(floor, max), max };
}

/** O DPR para um fator do monitor (0 = o piso, 1 = o teto), em passos de 0,05 (evita redimensionar por pouco). */
export function dprFor(factor: number, range: DprRange): number {
  const f = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 1;
  const raw = range.floor + (range.max - range.floor) * f;
  return Math.round(raw * 20) / 20;
}

/**
 * Os limites do monitor: abaixo de `lower` FPS a qualidade cai; a partir de `upper`, sobe. Com 60 Hz, cai abaixo de 40
 * (margem sobre o mínimo de 30 do orçamento) e sobe a partir de 55; numa tela de 120 Hz, os limites acompanham.
 */
export function monitorBounds(refreshRate: number): [number, number] {
  return refreshRate > 100 ? [60, 100] : [40, 55];
}

/** Parâmetros do monitor: 8 amostras de 250 ms (2 s) por decisão, passos de 0,25 (do teto ao piso em ~8 s). */
export const MONITOR = { ms: 250, iterations: 8, step: 0.25, threshold: 0.75, startFactor: 1, flipflops: 8 } as const;

/** O monitor só mede quando a cena desenha todo quadro. */
export function monitorEnabled(frameloop: Frameloop): boolean {
  return frameloop === 'always';
}
