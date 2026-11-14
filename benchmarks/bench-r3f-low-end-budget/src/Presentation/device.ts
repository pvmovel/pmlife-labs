// O que o navegador conta do aparelho e da página (US56): a GPU (quando o navegador mostra), núcleos, memória, tela, e
// os MB baixados pela página. Os MB usam o tamanho comprimido de cada recurso (encodedBodySize), que é o mesmo com ou
// sem cache: o número do "primeiro acesso" não muda se o aluno voltar à página.
import { classifyDevice, type DeviceClass } from '../Domain/Budget';

export interface DeviceInfo {
  model: string;
  class: DeviceClass;
  userAgent: string;
  cores: number | null;
  memoryGB: number | null;
  dpr: number;
  screen: string;
  gpu: string | null;
}

function gpuName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

export function deviceInfo(model: string): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return {
    model: model.trim(),
    class: classifyDevice({ touch, shortSide: Math.min(screen.width, screen.height) }),
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency || null,
    memoryGB: nav.deviceMemory ?? null,
    dpr: window.devicePixelRatio,
    screen: `${screen.width}x${screen.height}`,
    gpu: gpuName(),
  };
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 100) / 100;

/** MB que a página baixou até agora (comprimidos), incluindo o HTML. */
export function pageTransferMB(): number {
  const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')] as PerformanceResourceTiming[];
  return mb(entries.reduce((s, e) => s + (e.encodedBodySize || e.transferSize || 0), 0));
}

/** Memória do JavaScript em MB (só os navegadores com Chromium informam). */
export function heapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? mb(memory.usedJSHeapSize) : null;
}
