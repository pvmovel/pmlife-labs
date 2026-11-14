// A sonda da rodada (US56): a cada quadro guarda o intervalo desde o anterior e os draw calls e triângulos do quadro
// anterior. Achado: o renderer.info zera a cada gl.render (autoReset), e quem renderiza mais de uma vez no quadro (o
// ContactShadows, um portal, um passe extra) apagaria a contagem; a sonda desliga o autoReset e zera uma vez por quadro,
// depois de ler. Descarta o aquecimento (a fonte, os shaders compilando). Publica o andamento em window.__bench, que o
// HUD e o e2e leem.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export interface ProbeData {
  deltas: number[];
  calls: number[];
  triangles: number[];
}

declare global {
  interface Window {
    /** Quantas vezes o contexto WebGL foi perdido nesta página. */
    __contextLost?: number;
    __bench?: { fps: number; dpr: number; calls: number; triangles: number; elapsed: number; measuring: boolean; factor?: number };
  }
}

export function Probe({ warmupS, seconds, onDone }: { warmupS: number; seconds: number; onDone: (data: ProbeData) => void }) {
  const data = useRef<ProbeData>({ deltas: [], calls: [], triangles: [] });
  const last = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  const recent = useRef<number[]>([]);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((state) => {
    const now = performance.now();
    start.current ??= now;
    const elapsed = (now - start.current) / 1000;
    const delta = last.current === null ? 0 : now - last.current;
    last.current = now;
    const { calls, triangles } = state.gl.info.render;
    state.gl.info.reset();
    const measuring = elapsed >= warmupS && !done.current;
    if (measuring && delta > 0) {
      data.current.deltas.push(delta);
      data.current.calls.push(calls);
      data.current.triangles.push(triangles);
    }
    if (delta > 0) {
      recent.current.push(delta);
      if (recent.current.length > 30) recent.current.shift();
    }
    const avg = recent.current.reduce((s, d) => s + d, 0) / Math.max(1, recent.current.length);
    window.__bench = { ...window.__bench, fps: avg > 0 ? Math.round(1000 / avg) : 0, dpr: state.viewport.dpr, calls, triangles, elapsed, measuring };
    if (!done.current && elapsed >= warmupS + seconds) {
      done.current = true;
      onDone(data.current);
    }
  });
  return null;
}
