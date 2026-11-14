// As cidades do benchmark (US56), como dado: a "curso" tem o tamanho da fase de um curso real (3 prédios, 4 NPCs, mapa
// de 30 m), e a "estresse" tem 200 prédios numa grade, para ver onde o orçamento quebra. Nomes e cores inventados.
// A câmera percorre um caminho fixo (a mesma volta em todo aparelho), para as rodadas serem comparáveis.

export type ScenarioId = 'curso' | 'estresse';

export interface BenchBuilding {
  id: string;
  label: string;
  position: [number, number];
  size: [number, number, number];
  color: string;
}

export interface BenchCity {
  id: ScenarioId;
  halfSize: number;
  buildings: BenchBuilding[];
  npcs: [number, number][];
}

const PALETTE = ['#0284c7', '#0d9488', '#7c3aed', '#c2410c', '#be123c', '#4d7c0f', '#a16207', '#0369a1'];

export function benchCity(id: ScenarioId): BenchCity {
  if (id === 'curso') {
    return {
      id,
      halfSize: 15,
      buildings: [
        { id: 'oficina', label: 'Oficina', position: [-6, -5], size: [4, 8, 4], color: PALETTE[0] },
        { id: 'laboratorio', label: 'Laboratório', position: [6, -5], size: [4, 6, 4], color: PALETTE[1] },
        { id: 'biblioteca', label: 'Biblioteca', position: [0, 6], size: [6, 4, 4], color: PALETTE[2] },
      ],
      npcs: [
        [-3, 2],
        [3, 2],
        [-9, 4],
        [9, 4],
      ],
    };
  }
  const side = 20; // 20 × 10 = 200 prédios
  const buildings: BenchBuilding[] = [];
  for (let i = 0; i < side * 10; i++) {
    const col = i % side;
    const row = Math.floor(i / side);
    const h = 2 + ((i * 7) % 9);
    buildings.push({ id: `p${i}`, label: `P${i + 1}`, position: [-38 + col * 4, -18 + row * 4], size: [2.4, h, 2.4], color: PALETTE[i % PALETTE.length] });
  }
  return { id, halfSize: 42, buildings, npcs: [] };
}

/** Ponto da câmera no tempo `t` (s): uma volta em 20 s ao redor do centro, numa altura de 3ª pessoa, olhando o centro. */
export function cameraPath(t: number, halfSize: number): { position: [number, number, number]; target: [number, number, number] } {
  const angle = (t / 20) * Math.PI * 2;
  const r = halfSize * 0.9;
  return { position: [Math.sin(angle) * r, 4 + halfSize * 0.25, Math.cos(angle) * r], target: [0, 1.5, 0] };
}
