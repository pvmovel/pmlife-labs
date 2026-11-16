// Domain: o registro declarativo dos tipos de objeto da sala (US57). Um JSON (src/Content/tool-types.json) descreve cada
// tipo: os campos próprios e o formato de cada um, se fecha uma missão, se é alvo da tecla E e o que o E faz. Este
// módulo confere o registro e valida os objetos com ele; o php/src/ToolRegistry.php faz o mesmo, e os casos de
// conformidade (cases/*.json) provam que os dois dão os mesmos problemas. Uma ferramenta nova é uma entrada no JSON:
// nenhum validador muda (Open/Closed). Só um FORMATO novo (raro) é escrito nos dois lados. TypeScript puro.
import { VIDEO_ID, videoRefProblem } from './Video';

/** Os formatos que um campo de ferramenta pode ter (cada um existe no TypeScript e no PHP). */
export const FORMATS = ['textKey', 'int', 'enum', 'videoRef', 'youtubeId', 'fileRef'] as const;
export type Format = (typeof FORMATS)[number];

/** Um campo próprio de um tipo. */
export interface FieldSpec {
  readonly format: Format;
  readonly required?: boolean;
  /** `int`: a faixa aceita. */
  readonly min?: number;
  readonly max?: number;
  /** `enum`: os valores aceitos. */
  readonly values?: readonly string[];
}

/** Se o tipo fecha uma missão: nunca, se o autor quiser, ou sempre (o quiz). */
export type QuestRule = 'none' | 'optional' | 'required';
/** O que a tecla E faz perto do objeto: nada (o quadro), abre o vídeo (o totem) ou abre a janela do tipo. */
export type ToolAction = 'none' | 'video' | 'modal';

/** Um tipo de objeto da sala. */
export interface ToolType {
  readonly kind: string;
  /** O nome no editor do mundo, nos dois idiomas. */
  readonly label: Readonly<Record<'pt-BR' | 'en-US', string>>;
  readonly icon: string;
  readonly quest: QuestRule;
  /** É alvo da tecla E (tem raio de interação)? */
  readonly target: boolean;
  readonly action: ToolAction;
  readonly fields: Readonly<Record<string, FieldSpec>>;
  /** Exatamente um destes campos (o totem: `video` ou o `videoId` de antes); os dois juntos dão o código `both`. */
  readonly exclusive?: { readonly fields: readonly string[]; readonly both: string };
}

export type ToolRegistry = ReadonlyMap<string, ToolType>;

const KIND = /^[a-z][a-z0-9-]{1,30}$/;
const FIELD = /^[a-z][A-Za-z0-9]{1,30}$/;
/** Os campos que todo objeto tem (o motor cuida deles): um tipo não pode redefinir. */
const COMMON = new Set(['id', 'kind', 'width', 'textKey', 'placement', 'wall', 'offset', 'x', 'z', 'facing', 'questId']);

/**
 * Lê e confere o registro (um ou mais arquivos, na ordem: o da plataforma e, nos testes, o tipo de exemplo). Registro
 * malformado não sobe: o erro diz o tipo e o campo.
 */
export function parseRegistry(...files: readonly unknown[]): ToolRegistry {
  const out = new Map<string, ToolType>();
  for (const file of files) {
    const types = (file as { types?: unknown }).types;
    if (!Array.isArray(types)) throw new Error('registro: types precisa ser uma lista');
    for (const t of types as Record<string, unknown>[]) {
      const kind = String(t.kind ?? '');
      if (!KIND.test(kind)) throw new Error(`registro: kind "${kind}" fora do formato`);
      if (out.has(kind)) throw new Error(`registro: o tipo "${kind}" está repetido`);
      const label = t.label as Record<string, unknown> | undefined;
      if (typeof label?.['pt-BR'] !== 'string' || typeof label?.['en-US'] !== 'string' || !label['pt-BR'] || !label['en-US']) throw new Error(`registro: ${kind} precisa do nome em pt-BR e en-US`);
      if (typeof t.icon !== 'string' || !t.icon) throw new Error(`registro: ${kind} precisa de um ícone`);
      if (!['none', 'optional', 'required'].includes(t.quest as string)) throw new Error(`registro: ${kind}.quest precisa ser none, optional ou required`);
      if (typeof t.target !== 'boolean') throw new Error(`registro: ${kind}.target precisa ser true ou false`);
      if (!['none', 'video', 'modal'].includes(t.action as string)) throw new Error(`registro: ${kind}.action precisa ser none, video ou modal`);
      if (t.action !== 'none' && !t.target) throw new Error(`registro: ${kind} tem ação, mas não é alvo da tecla E`);
      const fields = (t.fields ?? {}) as Record<string, Record<string, unknown>>;
      for (const [name, f] of Object.entries(fields)) {
        if (!FIELD.test(name) || COMMON.has(name)) throw new Error(`registro: ${kind}.${name} não pode ser campo de um tipo`);
        if (!(FORMATS as readonly unknown[]).includes(f.format)) throw new Error(`registro: ${kind}.${name} tem o formato desconhecido "${String(f.format)}"`);
        if (f.format === 'int' && !(Number.isInteger(f.min) && Number.isInteger(f.max) && (f.min as number) <= (f.max as number))) throw new Error(`registro: ${kind}.${name} (int) precisa de min <= max`);
        if (f.format === 'enum' && !(Array.isArray(f.values) && f.values.length > 0 && f.values.every((v) => typeof v === 'string'))) throw new Error(`registro: ${kind}.${name} (enum) precisa dos valores`);
      }
      const exclusive = t.exclusive as ToolType['exclusive'] | undefined;
      if (exclusive && (exclusive.fields.length < 2 || !exclusive.fields.every((f) => f in fields) || typeof exclusive.both !== 'string')) throw new Error(`registro: ${kind}.exclusive precisa de 2 campos do tipo e do código`);
      out.set(kind, t as unknown as ToolType);
    }
  }
  return out;
}

/** O que o editor do mundo oferece em "Acrescentar": os tipos do registro, na ordem dele, no idioma da tela. */
export const editorKinds = (registry: ToolRegistry, locale: 'pt-BR' | 'en-US') => [...registry.values()].map((t) => ({ kind: t.kind, label: t.label[locale], icon: t.icon }));

/** O que a tecla E faz perto de um objeto do tipo (a tela abre a janela do tipo, sem saber qual é). */
export const actionOf = (registry: ToolRegistry, kind: string): ToolAction => registry.get(kind)?.action ?? 'none';

// ---------------------------------------------------------------- validação

/** Um problema, no mesmo formato do validador do produto: código estável, caminho (JSON Pointer) e um parâmetro. */
export interface Problem {
  readonly code: string;
  readonly path: string;
  readonly param?: string;
}

/** O que a validação precisa saber da sala: o prédio, as missões da fase e os textos que existem. */
export interface RoomContext {
  readonly buildingId: string;
  readonly quests: readonly { readonly id: string; readonly buildingId: string }[];
  readonly texts: readonly string[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const TEXT_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const FILE_REF = /^[a-z0-9][a-z0-9-]{0,39}$/;
const WALLS = ['north', 'east', 'south', 'west'];
type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Valida os objetos de uma sala com o registro. A forma comum (id, o lugar na parede ou no chão, a largura, o tipo e o
 * texto) segue a mesma ordem e os mesmos códigos do validador do produto; depois vêm as regras do tipo: o par exclusivo,
 * os campos próprios pelo formato e a missão.
 *
 * @param items - Os objetos (o `wallItems` da sala).
 * @param registry - O registro.
 * @param ctx - O prédio, as missões e os textos.
 * @param at - O caminho da lista no documento.
 */
export function validateItems(items: readonly unknown[], registry: ToolRegistry, ctx: RoomContext, at = '/items'): Problem[] {
  const out: Problem[] = [];
  const add = (code: string, path: string, param?: string) => out.push(param === undefined ? { code, path } : { code, path, param });
  const missing = (v: unknown, path: string) => (add(v === undefined || v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', path), false);
  const number = (o: Obj, f: string, p: string) => isNumber(o[f]) || missing(o[f], `${p}/${f}`);
  const string = (o: Obj, f: string, p: string) => {
    const v = o[f];
    return (typeof v === 'string' && v.trim() !== '' && new TextEncoder().encode(v).length <= 120) || missing(v, `${p}/${f}`);
  };
  const id = (o: Obj, f: string, p: string) => {
    if (!string(o, f, p)) return false;
    if (ID.test(o[f] as string)) return true;
    add('ID_INVALID', `${p}/${f}`);
    return false;
  };
  const usedKeys = new Map<string, string>();
  const textKey = (o: Obj, f: string, p: string) => {
    if (!string(o, f, p)) return false;
    if (!TEXT_KEY.test(o[f] as string)) {
      add('TEXT_KEY_INVALID', `${p}/${f}`);
      return false;
    }
    if (!usedKeys.has(o[f] as string)) usedKeys.set(o[f] as string, `${p}/${f}`);
    return true;
  };

  items.forEach((w, k) => {
    const wp = `${at}/${k}`;
    if (!isObject(w)) return void missing(w, wp);
    if ('placement' in w && w.placement !== 'wall' && w.placement !== 'floor') return void add('PLACEMENT_UNKNOWN', `${wp}/placement`);
    const floor = w.placement === 'floor';
    const place = floor ? [number(w, 'x', wp), number(w, 'z', wp), string(w, 'facing', wp)] : [string(w, 'wall', wp), number(w, 'offset', wp)];
    if (![id(w, 'id', wp), ...place, number(w, 'width', wp), string(w, 'kind', wp), textKey(w, 'textKey', wp)].every(Boolean)) return;
    const side = floor ? 'facing' : 'wall';
    if (!WALLS.includes(w[side] as string)) return void add('WALL_UNKNOWN', `${wp}/${side}`);
    const type = registry.get(w.kind as string);
    if (!type) return void add('WALL_ITEM_KIND_UNKNOWN', `${wp}/kind`);
    toolRules(w, wp, type, ctx, add, textKey);
  });
  for (const [key, where] of usedKeys) if (!ctx.texts.includes(key)) add('TEXT_KEY_MISSING', where);
  return out;
}

/** As regras do tipo: o par exclusivo, os campos próprios pelo formato e a missão. */
function toolRules(
  w: Obj,
  wp: string,
  type: ToolType,
  ctx: RoomContext,
  add: (code: string, path: string, param?: string) => void,
  textKey: (o: Obj, f: string, p: string) => boolean,
): void {
  if (type.exclusive) {
    const present = type.exclusive.fields.filter((f) => f in w);
    if (present.length > 1) return add(type.exclusive.both, wp);
    if (present.length === 0) return add('FIELD_REQUIRED', `${wp}/${type.exclusive.fields[0]}`);
  }
  for (const [name, spec] of Object.entries(type.fields)) {
    const fp = `${wp}/${name}`;
    if (!(name in w)) {
      if (spec.required) add('FIELD_REQUIRED', fp);
      continue;
    }
    const v = w[name];
    switch (spec.format) {
      case 'textKey':
        textKey(w, name, wp);
        break;
      case 'int':
        if (!Number.isInteger(v)) add('FIELD_TYPE', fp);
        else if ((v as number) < (spec.min as number) || (v as number) > (spec.max as number)) add('FIELD_RANGE', fp);
        break;
      case 'enum':
        if (typeof v !== 'string') add('FIELD_TYPE', fp);
        else if (!(spec.values ?? []).includes(v)) add('FIELD_ENUM', fp);
        break;
      case 'fileRef':
        if (typeof v !== 'string') add('FIELD_TYPE', fp);
        else if (!FILE_REF.test(v)) add('FILE_REF_INVALID', fp);
        break;
      case 'youtubeId':
        // Como o `string` do produto: vazio ou com mais de 120 bytes é FIELD_TYPE, antes do formato do ID.
        if (typeof v !== 'string' || v.trim() === '' || new TextEncoder().encode(v).length > 120) add(v === null ? 'FIELD_REQUIRED' : 'FIELD_TYPE', fp);
        else if (!VIDEO_ID.test(v)) add('VIDEO_ID_INVALID', fp);
        break;
      case 'videoRef': {
        const problem = videoRefProblem(v);
        if (problem) add(problem, problem === 'VIDEO_PROVIDER_UNKNOWN' ? `${fp}/provider` : fp);
        break;
      }
    }
  }
  const qp = `${wp}/questId`;
  const has = 'questId' in w;
  if (type.quest === 'none') {
    if (has) add('TOOL_QUEST_NOT_ALLOWED', qp);
    return;
  }
  if (!has) {
    if (type.quest === 'required') add('FIELD_REQUIRED', qp);
    return;
  }
  const quest = ctx.quests.find((q) => q.id === w.questId);
  if (!quest) add('TOOL_QUEST_UNKNOWN', qp);
  else if (quest.buildingId !== ctx.buildingId) add('TOOL_QUEST_OTHER_BUILDING', qp);
}
