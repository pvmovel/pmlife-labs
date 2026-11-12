import { describe, expect, it } from 'vitest';
import { choose, indexAtSlot, initialActive, moveActive, pageCount, pageOf, pageRange, slotKey, slotOfCode, type ItemStatus } from '../Domain/KeyboardList';
import { avatarStep, nearest } from '../Domain/Plaza';
import { codeAccepted, enrollChoice } from '../Domain/Enrollment';

describe('a lista pelo teclado', () => {
  it('páginas de 10: 30 itens são 3 páginas; a lista vazia ainda tem 1', () => {
    expect([pageCount(30), pageCount(31), pageCount(10), pageCount(0)]).toEqual([3, 4, 1, 1]);
    expect([pageOf(0), pageOf(9), pageOf(10), pageOf(29)]).toEqual([0, 0, 1, 2]);
    expect(pageRange(2, 25)).toEqual({ start: 20, end: 25 });
  });

  it('a tecla de cada posição: 1 a 9 e o 0 na 10ª, em todas as páginas', () => {
    expect([slotKey(0), slotKey(8), slotKey(9), slotKey(10), slotKey(29)]).toEqual(['1', '9', '0', '1', '0']);
  });

  it('o número pelo `code`: o teclado de cima e o numérico; o resto não é número', () => {
    expect([slotOfCode('Digit1'), slotOfCode('Digit0'), slotOfCode('Numpad3'), slotOfCode('Numpad0')]).toEqual([0, 9, 2, 9]);
    expect([slotOfCode('KeyE'), slotOfCode('ArrowLeft'), slotOfCode('Digit')]).toEqual([null, null, null]);
  });

  it('o número leva ao item da página aberta; na página incompleta, a tecla sem item não faz nada', () => {
    expect(indexAtSlot(2, 0, 30)).toBe(2);
    expect(indexAtSlot(9, 2, 30)).toBe(29);
    expect(indexAtSlot(5, 2, 25)).toBeNull();
    expect(indexAtSlot(4, 2, 25)).toBe(24);
  });

  it('↑/↓ andam um item e atravessam a página; nas pontas param, sem dar a volta', () => {
    expect(moveActive(9, 'ArrowDown', 30)).toBe(10);
    expect(moveActive(10, 'ArrowUp', 30)).toBe(9);
    expect(moveActive(0, 'ArrowUp', 30)).toBe(0);
    expect(moveActive(29, 'ArrowDown', 30)).toBe(29);
  });

  it('←/→ e PageUp/PageDown trocam a página mantendo a posição; na página curta, vão ao último', () => {
    expect(moveActive(3, 'ArrowRight', 30)).toBe(13);
    expect(moveActive(13, 'PageDown', 30)).toBe(23);
    expect(moveActive(23, 'ArrowRight', 30)).toBe(23);
    expect(moveActive(23, 'PageUp', 30)).toBe(13);
    expect(moveActive(3, 'ArrowLeft', 30)).toBe(3);
    expect(moveActive(8, 'ArrowRight', 25)).toBe(18);
    expect(moveActive(18, 'ArrowRight', 25)).toBe(24);
  });

  it('Home e End vão ao primeiro e ao último item da lista', () => {
    expect(moveActive(17, 'Home', 30)).toBe(0);
    expect(moveActive(2, 'End', 30)).toBe(29);
  });

  it('ao abrir, o destaque vai à fase em andamento; senão à primeira que abre; nunca a uma bloqueada', () => {
    const s = (...v: ItemStatus[]) => v;
    expect(initialActive(s('concluded', 'concluded', 'in-progress', 'open'))).toBe(2);
    expect(initialActive(s('concluded', 'locked', 'open'))).toBe(2);
    expect(initialActive(s('concluded', 'locked'))).toBe(0);
    expect(initialActive(s('locked', 'locked'))).toBe(0);
  });

  it('escolher uma fase bloqueada não vai; as outras vão', () => {
    expect(choose(1, ['open', 'locked'])).toEqual({ kind: 'blocked', index: 1 });
    expect(choose(0, ['concluded', 'locked'])).toEqual({ kind: 'go', index: 0 });
  });
});

describe('o avatar e a janela', () => {
  it('com a janela aberta, o avatar não anda, nem com as setas apertadas', () => {
    const at = { x: 10, y: 9 };
    expect(avatarStep(at, new Set(['ArrowLeft']), 0.05, true)).toBe(at);
    expect(avatarStep(at, new Set(['ArrowLeft']), 0.05, false).x).toBeLessThan(10);
  });

  it('na diagonal, a mesma velocidade; um quadro longo não teletransporta', () => {
    const d = avatarStep({ x: 10, y: 9 }, new Set(['KeyW', 'KeyD']), 0.05, false);
    expect(Math.hypot(d.x - 10, d.y - 9)).toBeCloseTo(0.3, 5);
    const far = avatarStep({ x: 10, y: 9 }, new Set(['KeyD']), 5, false);
    expect(far.x).toBeCloseTo(10.6, 5);
  });

  it('o prédio mais perto ao alcance', () => {
    const b = [
      { id: 'a', at: { x: 0, y: 0 }, reach: 2 },
      { id: 'b', at: { x: 3, y: 0 }, reach: 2 },
    ];
    expect(nearest({ x: 1.8, y: 0 }, b)?.id).toBe('b');
    expect(nearest({ x: 10, y: 10 }, b)).toBeNull();
  });
});

describe('as matrículas', () => {
  it('escolher faz o que o botão do curso faz; no curso por código, pede o código', () => {
    expect(enrollChoice('free', 'none')).toEqual({ kind: 'enroll' });
    expect(enrollChoice('approval', 'none')).toEqual({ kind: 'request' });
    expect(enrollChoice('code', 'none')).toEqual({ kind: 'ask-code' });
    expect(enrollChoice('free', 'active')).toEqual({ kind: 'nothing' });
    expect(enrollChoice('approval', 'pending')).toEqual({ kind: 'nothing' });
  });

  it('o código da demo, sem diferença de maiúsculas e espaços', () => {
    expect(codeAccepted(' aurora-2026 ')).toBe(true);
    expect(codeAccepted('AURORA-2025')).toBe(false);
  });
});
