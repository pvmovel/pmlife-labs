// Seleção no modo Orbital (US27) no grafo do three.js, sem WebGL. O Text do drei (que baixa a fonte) vira um
// marcador e o Billboard um grupo simples, para o prédio não ficar suspenso esperando a fonte.
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { toCampus } from '../Domain/Campus';
import campusData from '../Content/campus.json';

vi.mock('@react-three/drei', () => ({
  Billboard: ({ children }: { children: React.ReactNode }) => <group name="billboard">{children}</group>,
  Text: ({ children }: { children: string }) => <group name={`rotulo:${children}`} />,
}));

const campus = toCampus(campusData);
describe('seleção no modo Orbital (US27)', () => {
  const library = campus.buildings.find((b) => b.id === 'biblioteca')!;

  it('um clique parado no prédio (corpo ou rótulo) o seleciona; o fim de um arraste, não', async () => {
    const { Building3D } = await import('../Presentation/Engine3D/Building3D');
    const onSelect = vi.fn();
    const r = await ReactThreeTestRenderer.create(<Building3D building={library} label="Biblioteca" onSelect={onSelect} />);
    const group = r.scene.findByProps({ name: 'biblioteca' });
    expect(r.scene.findByProps({ name: 'rotulo:Biblioteca' })).toBeTruthy(); // o rótulo está dentro do grupo clicável
    await r.fireEvent(group, 'click', { delta: 3, stopPropagation: () => {} });
    expect(onSelect).toHaveBeenCalledWith('biblioteca');
    await r.fireEvent(group, 'click', { delta: 40, stopPropagation: () => {} });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('passar o mouse por cima mostra o cursor de clicável; sair volta ao normal', async () => {
    const { Building3D } = await import('../Presentation/Engine3D/Building3D');
    const r = await ReactThreeTestRenderer.create(<Building3D building={library} label="Biblioteca" onSelect={() => {}} />);
    const group = r.scene.findByProps({ name: 'biblioteca' });
    await r.fireEvent(group, 'pointerOver', { stopPropagation: () => {} });
    expect(document.body.style.cursor).toBe('pointer');
    await r.fireEvent(group, 'pointerOut');
    expect(document.body.style.cursor).toBe('');
  });

  it('sem onSelect (modo Avatar), o prédio não é clicável e o cursor volta ao normal', async () => {
    const { Building3D } = await import('../Presentation/Engine3D/Building3D');
    document.body.style.cursor = 'pointer';
    const r = await ReactThreeTestRenderer.create(<Building3D building={library} label="Biblioteca" />);
    expect(r.scene.findByProps({ name: 'biblioteca' }).props.onClick).toBeUndefined();
    expect(document.body.style.cursor).toBe('');
  });

  it('isClick: até 6 px de movimento é clique (toque), acima é arraste', async () => {
    const { isClick, CLICK_TOLERANCE_PX } = await import('../Presentation/Engine3D/picking');
    expect(CLICK_TOLERANCE_PX).toBe(6);
    expect([isClick(0), isClick(6), isClick(7)]).toEqual([true, true, false]);
  });
});

