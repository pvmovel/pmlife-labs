// Domain: a lista única dos atalhos do modo Avatar (US78). A janela de boas-vindas, a ajuda (H), os botões do HUD e a
// trava dos testes leem a mesma lista (src/Content/shortcuts.json), então uma tecla nunca aparece numa tela e falta
// na outra. TypeScript puro: o evento do teclado chega aqui já traduzido (a Presentation diz se o aluno digita).

export type ShortcutGroup = 'move' | 'action' | 'view' | 'window';

export interface Shortcut {
  readonly id: string;
  /** A tecla que dispara a ação (uma letra, minúscula). Sem ela, o atalho é só informativo (andar, Esc). */
  readonly key?: string;
  /** O que a ajuda mostra (W, A, S, D, ↑…). */
  readonly keys: readonly string[];
  readonly group: ShortcutGroup;
  readonly labelKey: string;
}

export interface ShortcutMap {
  readonly shortcuts: readonly Shortcut[];
  /** Tecla (minúscula) ➔ id da ação. */
  readonly byKey: ReadonlyMap<string, string>;
}

/** O que a Presentation sabe do evento do teclado. */
export interface KeyEventLike {
  readonly key: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  /** O foco está num campo onde se digita (input, textarea, select, editor)? */
  readonly typing: boolean;
}

const GROUPS: ReadonlySet<string> = new Set(['move', 'action', 'view', 'window']);
const LETTER = /^[a-z]$/;

/**
 * Converte o JSON do conteúdo na lista de atalhos, recusando o que quebraria o teclado: id repetido, tecla que não é
 * uma letra, tecla repetida (duas ações na mesma letra) e tecla reservada (WASD e setas andam; Esc, Tab e Enter são
 * das janelas). O erro diz o atalho errado.
 */
export function toShortcuts(raw: unknown): ShortcutMap {
  const c = raw as { reserved?: unknown; shortcuts?: unknown };
  if (!Array.isArray(c.reserved) || !c.reserved.every((k) => typeof k === 'string')) throw new Error('atalhos: reserved precisa ser uma lista de teclas');
  if (!Array.isArray(c.shortcuts)) throw new Error('atalhos: shortcuts precisa ser uma lista');
  const reserved = new Set((c.reserved as string[]).map((k) => k.toLowerCase()));
  const ids = new Set<string>();
  const byKey = new Map<string, string>();
  const shortcuts = c.shortcuts.map((s: Record<string, unknown>, i: number): Shortcut => {
    if (typeof s.id !== 'string' || !s.id) throw new Error(`atalhos: o item ${i} não tem id`);
    if (ids.has(s.id)) throw new Error(`atalhos: o id "${s.id}" está repetido`);
    ids.add(s.id);
    if (typeof s.group !== 'string' || !GROUPS.has(s.group)) throw new Error(`atalhos: ${s.id}.group precisa ser move, action, view ou window`);
    if (typeof s.labelKey !== 'string' || !s.labelKey) throw new Error(`atalhos: ${s.id} não tem labelKey`);
    if (!Array.isArray(s.keys) || s.keys.length === 0 || !s.keys.every((k) => typeof k === 'string' && k)) throw new Error(`atalhos: ${s.id}.keys precisa listar as teclas`);
    if (s.key !== undefined) {
      if (typeof s.key !== 'string' || !LETTER.test(s.key)) throw new Error(`atalhos: ${s.id}.key precisa ser uma letra minúscula`);
      if (reserved.has(s.key)) throw new Error(`atalhos: a tecla "${s.key}" de ${s.id} é reservada (andar ou janelas)`);
      const other = byKey.get(s.key);
      if (other) throw new Error(`atalhos: a tecla "${s.key}" está em ${other} e em ${s.id}`);
      byKey.set(s.key, s.id);
    }
    return {
      id: s.id,
      ...(typeof s.key === 'string' ? { key: s.key } : {}),
      keys: [...(s.keys as string[])],
      group: s.group as ShortcutGroup,
      labelKey: s.labelKey,
    };
  });
  return { shortcuts, byKey };
}

/**
 * A ação de uma tecla apertada, ou null. Nunca dispara enquanto o aluno digita (a letra é texto), com Ctrl, Cmd ou Alt
 * (Ctrl+C copia, Ctrl+T abre aba, Ctrl+H é o histórico) nem ao segurar a tecla.
 */
export function actionFor(map: ShortcutMap, e: KeyEventLike): string | null {
  if (e.typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  return map.byKey.get(e.key.toLowerCase()) ?? null;
}

/** O atalho de uma ação (para o botão mostrar a tecla e o aria-keyshortcuts). */
export function shortcutOf(map: ShortcutMap, id: string): Shortcut | undefined {
  return map.shortcuts.find((s) => s.id === id);
}

/** A tecla como o aria-keyshortcuts e o <kbd> mostram (maiúscula), ou '' sem tecla. */
export const keyLabel = (s: Shortcut | undefined): string => (s?.key ? s.key.toUpperCase() : '');

/**
 * A trava da regra "Avatar 100% teclado" (CLAUDE.md): as ações do HUD que não têm tecla. Vazio = tudo pelo teclado.
 * O teste da tela passa as ações dos botões que de fato aparecem no HUD.
 */
export function missingShortcuts(map: ShortcutMap, hudActions: readonly string[]): string[] {
  return [...new Set(hudActions)].filter((id) => !shortcutOf(map, id)?.key);
}

/** Os atalhos por grupo, na ordem em que a ajuda os mostra. */
export function grouped(map: ShortcutMap): { group: ShortcutGroup; items: Shortcut[] }[] {
  const order: ShortcutGroup[] = ['move', 'action', 'view', 'window'];
  return order.map((group) => ({ group, items: map.shortcuts.filter((s) => s.group === group) })).filter((g) => g.items.length > 0);
}
