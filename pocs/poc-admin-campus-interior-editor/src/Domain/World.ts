// O formato editável do mundo (o que o editor mexe e o servidor guarda): uma cidade vista de cima, os prédios, o ponto
// de chegada e o interior de cada prédio (a sala, a porta, as estações de missão e os objetos de parede). Unidades em
// metros; o centro da cidade e o de cada sala são (0, 0); x cresce para o leste e z para o sul.

/** Os tipos de cidade: a sede da instituição, a cidade de um curso e a de uma fase. */
export type CityKind = 'headquarters' | 'course' | 'phase';

/** Um texto nos dois idiomas da plataforma. */
export interface Label {
  readonly pt: string;
  readonly en: string;
}

/** Um prédio da cidade. A posição é o centro da base; o tamanho é largura (x), altura e profundidade (z). */
export interface Building {
  readonly id: string;
  readonly label: Label;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Cor `#rrggbb`. */
  readonly color: string;
  /** Papel fixo (ex.: o prédio de Matrículas): pode mudar de lugar, cor e nome, mas não sair da cidade. */
  readonly role?: string;
}

/** Uma estação de missão dentro da sala. */
export interface Station {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** A missão que a estação abre (de uma missão do mesmo prédio). */
  readonly questId: string;
}

/** As quatro paredes da sala. A porta fica sempre na parede sul. */
export type Wall = 'north' | 'east' | 'south' | 'west';

/** Um objeto preso à parede. Hoje só o quadro (com um texto); a US38 acrescenta o totem de vídeo. */
export interface WallItem {
  readonly id: string;
  readonly wall: Wall;
  /** A posição ao longo da parede, do centro dela (de oeste para leste, ou de norte para sul). */
  readonly offset: number;
  /** Largura ocupada na parede. */
  readonly width: number;
  readonly kind: 'board';
  readonly text: Label;
}

/** O interior de um prédio: uma sala quadrada, com a porta na parede sul. */
export interface Interior {
  readonly buildingId: string;
  /** Meio lado da sala. */
  readonly halfSize: number;
  /** Posição da porta ao longo da parede sul. */
  readonly doorX: number;
  readonly stations: readonly Station[];
  readonly wallItems: readonly WallItem[];
}

/** Uma missão da cidade (o conteúdo vem do curso; o editor só liga a estação a ela). */
export interface Quest {
  readonly id: string;
  readonly buildingId: string;
  readonly label: Label;
}

/** Uma cidade editável. */
export interface World {
  readonly kind: CityKind;
  /** Meio lado do mapa. */
  readonly halfSize: number;
  readonly spawn: { readonly x: number; readonly z: number };
  readonly buildings: readonly Building[];
  readonly interiors: readonly Interior[];
  readonly quests: readonly Quest[];
}

/** Os prédios obrigatórios de cada tipo de cidade (o mesmo do motor do jogo). */
export const REQUIRED_ROLES: Readonly<Record<CityKind, readonly string[]>> = {
  headquarters: ['enrollment', 'institutional', 'secretariat', 'courses-portal'],
  course: ['phases-portal', 'board'],
  phase: [],
};

/** Limites e medidas comuns ao editor e ao validador. */
export const GEOMETRY = {
  /** O passo da grade: posições e tamanhos andam de meio em meio metro. */
  grid: 0.5,
  /** Raio de uma estação (ela ocupa um círculo). */
  stationRadius: 0.6,
  /** Meia largura da porta. */
  doorHalfWidth: 1,
  /** Profundidade livre na frente da porta, para o aluno entrar e sair. */
  doorClearance: 2,
  /** Tamanho mínimo e máximo de uma sala (meio lado). */
  minRoom: 3,
  maxRoom: 12,
} as const;

/** Arredonda para a grade do editor. */
export const snap = (v: number): number => Math.round(v / GEOMETRY.grid) * GEOMETRY.grid;
