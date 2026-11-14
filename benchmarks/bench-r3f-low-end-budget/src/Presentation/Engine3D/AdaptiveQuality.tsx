// Qualidade adaptativa (US56): o PerformanceMonitor do drei mede o FPS e mexe no fator; a resolução vem da política do
// Domain (entre o piso e o teto) e volta por `onDpr` para quem desenha o Canvas, que a passa na prop `dpr`. Achado do
// benchmark: chamar o `setDpr` do fiber direto não basta, porque a cada novo render do Canvas o fiber reaplica a prop
// `dpr` e desfaz a mudança (o DPR voltava de 1,7 para 2). O valor do fator inicial é avisado já na montagem: o monitor
// só avisa quando o fator MUDA. Com o frameloop "demand", o monitor não liga (mediria os intervalos entre quadros
// esparsos como FPS baixo), a não ser que `force` peça, para a demo do achado. Outro achado: o `onChange` do monitor
// (drei 10.7) compara com um "último fator" guardado numa variável do render, que volta a 0 a cada novo render; depois
// de qualquer render, a passagem para o fator 0 (o piso) não avisa. Por isso a qualidade escuta o `onDecline` e o
// `onIncline`, que avisam sempre.
import { useEffect, useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { dprFor, MONITOR, monitorBounds, monitorEnabled, type DprRange, type Frameloop } from '../../Domain/AdaptiveQuality';

export function AdaptiveQuality({ range, frameloop, force = false, onDpr }: { range: DprRange; frameloop: Frameloop; force?: boolean; onDpr: (dpr: number, factor: number) => void }) {
  const factor = useRef<number>(MONITOR.startFactor);
  const report = useRef(onDpr);
  report.current = onDpr;
  const apply = (f: number) => {
    factor.current = f;
    report.current(dprFor(f, range), f);
  };
  useEffect(() => {
    report.current(dprFor(factor.current, range), factor.current);
  }, [range]);
  if (!force && !monitorEnabled(frameloop)) return null;
  return (
    <PerformanceMonitor
      ms={MONITOR.ms}
      iterations={MONITOR.iterations}
      step={MONITOR.step}
      threshold={MONITOR.threshold}
      factor={MONITOR.startFactor}
      flipflops={MONITOR.flipflops}
      bounds={monitorBounds}
      onDecline={({ factor: f }) => apply(f)}
      onIncline={({ factor: f }) => apply(f)}
    />
  );
}
