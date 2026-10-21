// Regras do joystick de toque (Domain): zona morta, direções retas e diagonais, limites e junção com o teclado.
import { describe, expect, it } from 'vitest';
import { clampToRadius, combineInputs, DEFAULT_DEAD_ZONE, joystickToMoveInput, STILL } from '../Domain/TouchJoystick';

const only = (dir: 'forward' | 'backward' | 'left' | 'right') => ({ ...STILL, [dir]: true });

describe('joystickToMoveInput', () => {
  it('dentro da zona morta o avatar fica parado', () => {
    expect(joystickToMoveInput(0, 0)).toEqual(STILL);
    expect(joystickToMoveInput(0.1, -0.15)).toEqual(STILL);
    expect(joystickToMoveInput(0, -DEFAULT_DEAD_ZONE)).toEqual(STILL);
  });

  it('Gherkin: para cima anda para a frente; para baixo, para trás', () => {
    expect(joystickToMoveInput(0, -1)).toEqual(only('forward'));
    expect(joystickToMoveInput(0, 0.6)).toEqual(only('backward'));
  });

  it('Gherkin: para os lados gira para o mesmo lado', () => {
    expect(joystickToMoveInput(-1, 0)).toEqual(only('left'));
    expect(joystickToMoveInput(0.5, 0)).toEqual(only('right'));
  });

  it('um tremor do dedo para o lado não faz o avatar girar enquanto anda', () => {
    expect(joystickToMoveInput(0.3, -1)).toEqual(only('forward'));
    expect(joystickToMoveInput(-0.35, -0.9)).toEqual(only('forward'));
  });

  it('diagonais andam e giram ao mesmo tempo', () => {
    const d = Math.SQRT1_2;
    expect(joystickToMoveInput(-d, -d)).toEqual({ ...STILL, forward: true, left: true });
    expect(joystickToMoveInput(d, d)).toEqual({ ...STILL, backward: true, right: true });
  });

  it('fora do círculo vale a direção, sem nada a mais', () => {
    expect(joystickToMoveInput(0, -5)).toEqual(only('forward'));
  });

  it('zona morta configurável e entradas inválidas', () => {
    expect(joystickToMoveInput(0, -0.4, 0.5)).toEqual(STILL);
    expect(joystickToMoveInput(0, -0.4, 0)).toEqual(only('forward'));
    expect(joystickToMoveInput(Number.NaN, -1)).toEqual(STILL);
    expect(joystickToMoveInput(0, Number.POSITIVE_INFINITY)).toEqual(STILL);
  });
});

describe('clampToRadius', () => {
  it('dentro do raio não muda; fora, vai para a borda na mesma direção', () => {
    expect(clampToRadius(10, -20, 50)).toEqual({ dx: 10, dy: -20 });
    const c = clampToRadius(0, -200, 50);
    expect(c.dx).toBeCloseTo(0);
    expect(c.dy).toBeCloseTo(-50);
    const d = clampToRadius(300, 400, 50);
    expect(d.dx).toBeCloseTo(30);
    expect(d.dy).toBeCloseTo(40);
    expect(clampToRadius(0, 0, 50)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('combineInputs', () => {
  it('teclado e joystick somam: cada direção vale se qualquer um pedir', () => {
    expect(combineInputs(only('forward'), only('left'))).toEqual({ ...STILL, forward: true, left: true });
    expect(combineInputs(STILL, STILL)).toEqual(STILL);
  });
});
