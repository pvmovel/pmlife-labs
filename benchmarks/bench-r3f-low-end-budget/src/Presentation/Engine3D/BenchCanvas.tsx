// O Canvas de uma rodada (US56). Qualidade "fixo": o `dpr={[1, 2]}` de hoje no produto. Qualidade "adaptativo": o
// DPR começa no teto e o monitor baixa até o piso quando o FPS cai. Câmera "avatar": a cena desenha todo quadro
// (frameloop "always"); "orbital": só quando algo muda ("demand"), aqui a cada 250 ms, como quem mexe de vez em quando.
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { dprRange, type Frameloop } from '../../Domain/AdaptiveQuality';
import type { BenchCity } from '../../Domain/Scenario';
import { AdaptiveQuality } from './AdaptiveQuality';
import { BenchScene, type AvatarShadow } from './BenchScene';
import { Probe, type ProbeData } from './Probe';

export type Quality = 'fixo' | 'adaptativo';
export type CameraMode = 'avatar' | 'orbital';

export interface RunOptions {
  city: BenchCity;
  quality: Quality;
  camera: CameraMode;
  shadows: boolean;
  avatarShadow: AvatarShadow;
  warmupS: number;
  seconds: number;
  /** Liga o monitor mesmo no frameloop "demand" (só para a demo do achado). */
  forceMonitor: boolean;
  /**
   * Só no e2e: custo simulado de preenchimento, em ms por megapixel desenhado, como uma GPU fraca (o tempo cresce com a
   * resolução). Torna o cenário "qualidade cai sozinha" determinístico no Chrome headless. 0 = desligado.
   */
  fillCostMs: number;
}

/** Ocupa a thread por `fillCostMs` × megapixels do canvas a cada quadro (só no e2e). */
function SimulatedFillCost({ msPerMegapixel }: { msPerMegapixel: number }) {
  useFrame((state) => {
    const megapixels = (state.size.width * state.size.height * state.viewport.dpr ** 2) / 1e6;
    const until = performance.now() + msPerMegapixel * megapixels;
    while (performance.now() < until) {
      /* espera ativa: simula o tempo da GPU */
    }
  });
  return null;
}

function Invalidator({ everyMs }: { everyMs: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => invalidate(), everyMs);
    return () => clearInterval(id);
  }, [invalidate, everyMs]);
  return null;
}

export function BenchCanvas({ options, onDone, onDpr }: { options: RunOptions; onDone: (data: ProbeData) => void; onDpr: (dpr: number) => void }) {
  const frameloop: Frameloop = options.camera === 'avatar' ? 'always' : 'demand';
  const range = useMemo(() => dprRange(window.devicePixelRatio), []);
  // O DPR da qualidade adaptativa é estado daqui, passado na prop do Canvas (o fiber reaplica a prop a cada render).
  const [dpr, setDpr] = useState(range.max);
  const s = options.city.halfSize;
  return (
    <Canvas
      shadows={options.shadows}
      frameloop={frameloop}
      dpr={options.quality === 'fixo' ? [1, 2] : dpr}
      camera={{ position: [s * 1.2, s, s * 1.4], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <BenchScene city={options.city} shadows={options.shadows} avatarShadow={options.avatarShadow} moving={options.camera === 'avatar'} />
        <Probe warmupS={options.warmupS} seconds={options.seconds} onDone={onDone} />
      </Suspense>
      {options.quality === 'adaptativo' && (
        <AdaptiveQuality
          range={range}
          frameloop={frameloop}
          force={options.forceMonitor}
          onDpr={(next, factor) => {
            window.__bench = { ...(window.__bench ?? { fps: 0, calls: 0, triangles: 0, elapsed: 0, measuring: false }), dpr: next, factor };
            setDpr(next);
            onDpr(next);
          }}
        />
      )}
      {frameloop === 'demand' && <Invalidator everyMs={250} />}
      {options.fillCostMs > 0 && <SimulatedFillCost msPerMegapixel={options.fillCostMs} />}
    </Canvas>
  );
}
