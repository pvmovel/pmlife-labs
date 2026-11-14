// As metas fixadas ficam só no aparelho (decisão do Pablo, US55): no produto, no SQLite WASM; na PoC, no
// localStorage, por fase. Ler e gravar nunca derrubam a página (aba anônima, armazenamento bloqueado): sem
// armazenamento, as metas valem só até fechar a aba.
const key = (phaseId: string) => `poc-active-goals.pins.${phaseId}`;
const MARKERS = 'poc-active-goals.markers';

export function loadPins(phaseId: string): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(phaseId)) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function savePins(phaseId: string, pins: readonly string[]): void {
  try {
    window.localStorage.setItem(key(phaseId), JSON.stringify(pins));
  } catch {
    // sem armazenamento: a escolha vale até fechar a aba
  }
}

export function loadMarkersOn(): boolean {
  try {
    return window.localStorage.getItem(MARKERS) !== 'off';
  } catch {
    return true;
  }
}

export function saveMarkersOn(on: boolean): void {
  try {
    window.localStorage.setItem(MARKERS, on ? 'on' : 'off');
  } catch {
    // idem
  }
}
