// A lista escolhida pelo teclado (US52), em TypeScript puro: páginas de 10, a tecla de cada item (1 a 9 e 0), as setas,
// as páginas e o item destacado ao abrir. A tela só traduz o evento numa `ListKey` e aplica o resultado.

/** Itens por página: as teclas 1 a 9 e 0 cobrem uma página inteira. */
export const PAGE_SIZE = 10;

/** A tecla de cada posição da página, na ordem: a 10ª é o 0. */
export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

/** As teclas de navegação que a lista entende (o número vem à parte, pela posição na página). */
export type ListKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'PageUp' | 'PageDown' | 'Home' | 'End';

/** O estado de um item: só o bloqueado não abre. */
export type ItemStatus = 'open' | 'in-progress' | 'concluded' | 'locked';

/** Quantas páginas a lista tem (no mínimo 1, mesmo vazia). */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** A página (a partir de 0) em que fica o item. */
export function pageOf(index: number): number {
  return Math.floor(Math.max(0, index) / PAGE_SIZE);
}

/** O primeiro e o último índice (exclusivo) de uma página. */
export function pageRange(page: number, total: number): { start: number; end: number } {
  const start = Math.min(page, pageCount(total) - 1) * PAGE_SIZE;
  return { start, end: Math.min(start + PAGE_SIZE, total) };
}

/** A tecla que aparece ao lado do item (a posição dele na página). */
export function slotKey(index: number): (typeof SLOT_KEYS)[number] {
  return SLOT_KEYS[index % PAGE_SIZE];
}

/**
 * A posição na página (0 a 9) de uma tecla de número, pelo `code` do evento: vale o teclado de cima e o numérico, em
 * qualquer layout (no AZERTY, o `key` do 1 é "&", mas o `code` continua "Digit1"). Outra tecla: null.
 */
export function slotOfCode(code: string): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (!m) return null;
  const d = Number(m[1]);
  return d === 0 ? 9 : d - 1;
}

/** O item de uma posição na página aberta, ou null se a página não tem tantos itens. */
export function indexAtSlot(slot: number, page: number, total: number): number | null {
  const { start, end } = pageRange(page, total);
  const index = start + slot;
  return slot >= 0 && slot < PAGE_SIZE && index < end ? index : null;
}

/**
 * O item destacado depois de uma tecla de navegação. As setas ↑/↓ andam um item e atravessam as páginas; ←/→ e
 * PageUp/PageDown trocam de página mantendo a posição (ou o último item da página nova); Home/End vão ao primeiro e ao
 * último. Nas pontas a lista para, sem dar a volta: o aluno sabe onde está.
 */
export function moveActive(active: number, key: ListKey, total: number): number {
  if (total <= 0) return 0;
  const last = total - 1;
  const clamp = (i: number) => Math.min(last, Math.max(0, i));
  switch (key) {
    case 'ArrowUp':
      return clamp(active - 1);
    case 'ArrowDown':
      return clamp(active + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'ArrowLeft':
    case 'PageUp':
      return pageOf(active) === 0 ? active : clamp(active - PAGE_SIZE);
    case 'ArrowRight':
    case 'PageDown':
      return pageOf(active) === pageCount(total) - 1 ? active : clamp(active + PAGE_SIZE);
  }
}

/** O item destacado ao abrir: o em andamento; senão o primeiro que abre; senão o primeiro. */
export function initialActive(statuses: readonly ItemStatus[]): number {
  const inProgress = statuses.indexOf('in-progress');
  if (inProgress >= 0) return inProgress;
  const open = statuses.findIndex((s) => s !== 'locked' && s !== 'concluded');
  if (open >= 0) return open;
  const any = statuses.findIndex((s) => s !== 'locked');
  return any >= 0 ? any : 0;
}

/** O que acontece ao escolher um item: ir, ou ficar porque ele está bloqueado. */
export type Choice = { kind: 'go'; index: number } | { kind: 'blocked'; index: number };

export function choose(index: number, statuses: readonly ItemStatus[]): Choice {
  return statuses[index] === 'locked' ? { kind: 'blocked', index } : { kind: 'go', index };
}
