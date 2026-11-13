// A demo como o totem: reconhece o link, recusa o resto sem guardar nada, ouve só o player certo e cai no aviso pelo
// prazo; o link de plano B só aparece onde a plataforma tem página pública.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../Presentation/main';

let root: HTMLElement;
let unmount: () => void;
const $ = (testid: string) => root.querySelector<HTMLElement>(`[data-testid=${testid}]`)!;
const paste = (link: string) => {
  const input = root.querySelector<HTMLInputElement>('#link')!;
  input.value = link;
  input.dispatchEvent(new Event('input'));
};
const openTotem = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Abrir no totem')!.click();
const fromPlayer = (origin: string, data: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { origin, data, source: root.querySelector('iframe')!.contentWindow }));

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('main');
  document.body.append(root);
  unmount = mount(root, 10_000);
});
afterEach(() => {
  unmount();
  root.remove();
  vi.useRealTimers();
});

describe('a demo do totem', () => {
  it('reconhece o Vimeo e mostra só a plataforma e o ID', () => {
    paste('https://vimeo.com/76979871/0a1b2c3d4e');
    expect($('result').textContent).toContain('Vimeo');
    expect(JSON.parse($('stored').textContent!)).toEqual({ video: { provider: 'vimeo', id: '76979871', hash: '0a1b2c3d4e' } });
  });

  it('recusa a plataforma fora da lista, sem guardar nada', () => {
    paste('https://www.dailymotion.com/video/x8abcd1');
    expect($('result').textContent).toContain('Recusado');
    expect($('stored').textContent).toBe('');
    expect([...root.querySelectorAll('button')].find((b) => b.textContent === 'Abrir no totem')!.disabled).toBe(true);
  });

  it('o Panda pronto toca; a mensagem de outra origem é ignorada', () => {
    paste('https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af');
    openTotem();
    fromPlayer('https://player.vimeo.com', { message: 'panda_ready' });
    expect($('status').textContent).toContain('Carregando');
    fromPlayer('https://player-vz-ded14ebd-85a.tv.pandavideo.com.br', { message: 'panda_ready', video: '3b101f05-84aa-4de0-9b64-71f1855388af' });
    expect($('status').textContent).toContain('pronto');
    vi.advanceTimersByTime(10_000);
    expect($('status').textContent).toContain('pronto');
  });

  it('o Bunny que não responde cai no aviso pelo prazo, sem link (o Bunny não tem página pública)', () => {
    paste('https://player.mediadelivery.net/embed/767357/00000000-0000-4000-8000-000000000000');
    openTotem();
    vi.advanceTimersByTime(10_000);
    expect($('status').textContent).toContain('não respondeu');
    expect($('status').querySelector('a')).toBeNull();
    expect(root.querySelector('iframe')).toBeNull();
  });

  it('o Vimeo inexistente mostra o aviso com o link para o Vimeo', () => {
    paste('https://vimeo.com/1');
    openTotem();
    fromPlayer('https://player.vimeo.com', '{"event":"error","data":{"name":"NotFoundError","method":"ready"}}');
    expect($('status').textContent).toContain('não está disponível');
    expect($('status').querySelector('a')!.getAttribute('href')).toBe('https://vimeo.com/1');
  });
});
