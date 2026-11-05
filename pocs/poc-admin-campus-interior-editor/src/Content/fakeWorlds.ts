// Dados inventados da demo: duas instituições fictícias (uma escola de inglês e um cursinho), cada uma com a sua sede e
// os seus cursos, e um curso fictício "da plataforma", vinculado à escola (só para ver e copiar). Ficam só na memória.
import type { WorldDocument } from '../Domain/Drafts';
import type { Building, World } from '../Domain/World';

const b = (id: string, pt: string, en: string, x: number, z: number, color: string, role?: string, size = 4): Building => ({
  id,
  label: { pt, en },
  x,
  z,
  width: size,
  height: 3,
  depth: size,
  color,
  ...(role ? { role } : {}),
});

/** A sede padrão (os prédios obrigatórios), com outro nome em cada instituição. */
const headquarters = (prefix: string): World => ({
  kind: 'headquarters',
  halfSize: 16,
  spawn: { x: 0, z: 10 },
  buildings: [
    b('matriculas', 'Matrículas', 'Enrollment', -8, -6, '#38bdf8', 'enrollment'),
    b('institucional', `${prefix} — Institucional`, `${prefix} — About us`, 0, -8, '#a78bfa', 'institutional'),
    b('secretaria', 'Secretaria do aluno', 'Student office', 8, -6, '#34d399', 'secretariat'),
    b('portal', 'Portal dos cursos', 'Courses portal', 0, 2, '#f59e0b', 'courses-portal', 3),
  ],
  interiors: [],
  quests: [],
});

const englishPhase: World = {
  kind: 'phase',
  halfSize: 14,
  spawn: { x: 0, z: 9 },
  buildings: [b('biblioteca', 'Biblioteca', 'Library', -6, -4, '#f97316', undefined, 5), b('cafe', 'Café da conversa', 'Conversation café', 6, -4, '#22c55e')],
  interiors: [
    {
      buildingId: 'biblioteca',
      halfSize: 6,
      doorX: 0,
      stations: [],
      wallItems: [{ id: 'quadro-1', wall: 'north', offset: 0, width: 2, kind: 'board', text: { pt: 'Silêncio, por favor', en: 'Quiet, please' } }],
    },
  ],
  quests: [
    { id: 'verbos', buildingId: 'biblioteca', label: { pt: 'Verbos irregulares', en: 'Irregular verbs' } },
    { id: 'leitura', buildingId: 'biblioteca', label: { pt: 'Leitura guiada', en: 'Guided reading' } },
    { id: 'pedido', buildingId: 'cafe', label: { pt: 'Fazer um pedido', en: 'Ordering' } },
  ],
};

const englishCity: World = {
  kind: 'course',
  halfSize: 14,
  spawn: { x: 0, z: 8 },
  buildings: [b('fases', 'Portal das fases', 'Phases portal', 0, -6, '#f59e0b', 'phases-portal', 3), b('mural', 'Mural da turma', 'Class board', 7, 0, '#64748b', 'board', 3)],
  interiors: [],
  quests: [],
};

const platformCourse: World = {
  kind: 'course',
  halfSize: 14,
  spawn: { x: 0, z: 8 },
  buildings: [b('fases', 'Portal das fases', 'Phases portal', 0, -6, '#f59e0b', 'phases-portal', 3), b('mural', 'Mural', 'Board', -7, 0, '#64748b', 'board', 3)],
  interiors: [],
  quests: [],
};

/** Uma instituição da demo, com os documentos dela (isolados das outras). */
export interface DemoInstitution {
  readonly slug: string;
  readonly name: string;
  readonly documents: readonly WorldDocument[];
}

const doc = (id: string, pt: string, en: string, world: World, source: 'tenant' | 'platform' = 'tenant'): WorldDocument => ({ id, title: { pt, en }, kind: world.kind, source, versions: [world], draft: null });

/** As instituições da demo, cada vez novas (recarregar a página volta ao início). */
export const demoInstitutions = (): DemoInstitution[] => [
  {
    slug: 'aurora',
    name: 'Escola de Inglês Aurora',
    documents: [
      doc('sede', 'Sede', 'Headquarters', headquarters('Aurora')),
      doc('ingles.cidade', 'Inglês Básico · cidade do curso', 'Basic English · course city', englishCity),
      doc('ingles.fase-1', 'Inglês Básico · Fase 1: no dia a dia', 'Basic English · Phase 1: everyday life', englishPhase),
      doc('trilha-modelo', 'Trilha-modelo da plataforma', 'Platform model track', platformCourse, 'platform'),
    ],
  },
  {
    slug: 'boreal',
    name: 'Cursinho Boreal',
    documents: [doc('sede', 'Sede', 'Headquarters', headquarters('Boreal'))],
  },
];
