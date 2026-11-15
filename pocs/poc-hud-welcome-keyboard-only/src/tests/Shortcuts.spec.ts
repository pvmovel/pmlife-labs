// A lista única de atalhos (US78): o conteúdo é conferido (tecla repetida, reservada ou que não é letra falha com o
// nome do atalho), a tecla vira a ação certa, nada dispara enquanto se digita ou com Ctrl/Cmd/Alt, e a trava aponta a
// ação do HUD sem tecla.
import { describe, expect, it } from 'vitest';
import data from '../Content/shortcuts.json';
import { actionFor, grouped, keyLabel, missingShortcuts, shortcutOf, toShortcuts } from '../Domain/Shortcuts';

const MAP = toShortcuts(data);
const press = (key: string, extra: Partial<Parameters<typeof actionFor>[1]> = {}) => actionFor(MAP, { key, typing: false, ...extra });
const base = (shortcuts: unknown[]) => ({ reserved: ['w', 'a', 's', 'd'], shortcuts });
const item = (id: string, key?: string) => ({ id, ...(key ? { key } : {}), keys: [key?.toUpperCase() ?? 'Esc'], group: 'action', labelKey: `shortcuts.${id}` });

describe('lista de atalhos', () => {
  it('as decisões do Pablo: M troca o modo, C abre o Co-Pilot, T o chat; E, I e H continuam', () => {
    expect(press('m')).toBe('mode');
    expect(press('c')).toBe('copilot');
    expect(press('t')).toBe('chat');
    expect(press('e')).toBe('interact');
    expect(press('i')).toBe('info');
    expect(press('h')).toBe('help');
    expect(press('M')).toBe('mode'); // Caps Lock ou Shift
  });

  it('andar não é ação: WASD e setas ficam com o avatar', () => {
    for (const k of ['w', 'a', 's', 'd', 'ArrowUp', 'Escape', 'Enter']) expect(press(k)).toBeNull();
  });

  it('nunca dispara enquanto se digita, com Ctrl/Cmd/Alt nem ao segurar a tecla', () => {
    expect(press('t', { typing: true })).toBeNull();
    expect(press('c', { ctrlKey: true })).toBeNull(); // Ctrl+C copia
    expect(press('t', { metaKey: true })).toBeNull(); // Cmd+T abre aba
    expect(press('h', { altKey: true })).toBeNull();
    expect(press('m', { repeat: true })).toBeNull();
  });

  it('recusa tecla repetida, apontando as duas ações', () => {
    expect(() => toShortcuts(base([item('chat', 't'), item('turma', 't')]))).toThrow('a tecla "t" está em chat e em turma');
  });

  it('recusa tecla reservada para andar', () => {
    expect(() => toShortcuts(base([item('salvar', 's')]))).toThrow('a tecla "s" de salvar é reservada');
  });

  it('recusa tecla que não é uma letra, id repetido e grupo desconhecido', () => {
    expect(() => toShortcuts(base([item('um', '1')]))).toThrow('um.key precisa ser uma letra minúscula');
    expect(() => toShortcuts(base([item('x', 'x'), item('x', 'y')]))).toThrow('o id "x" está repetido');
    expect(() => toShortcuts(base([{ ...item('x', 'x'), group: 'outro' }]))).toThrow('x.group');
  });

  it('Gherkin "Ação sem tecla barra o PR": a trava aponta a ação do HUD sem tecla', () => {
    expect(missingShortcuts(MAP, ['chat', 'copilot', 'mode', 'help', 'info', 'interact'])).toEqual([]);
    expect(missingShortcuts(MAP, ['chat', 'quiz'])).toEqual(['quiz']);
    expect(missingShortcuts(MAP, ['close'])).toEqual(['close']); // Esc é das janelas, não uma ação do HUD
  });

  it('a ajuda mostra os grupos na ordem: andar, ações, visão, janelas', () => {
    expect(grouped(MAP).map((g) => g.group)).toEqual(['move', 'action', 'view', 'window']);
    expect(keyLabel(shortcutOf(MAP, 'mode'))).toBe('M');
    expect(keyLabel(shortcutOf(MAP, 'move'))).toBe('');
  });
});
