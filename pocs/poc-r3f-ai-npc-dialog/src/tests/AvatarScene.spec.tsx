// Avatar e câmera no grafo do three.js, sem WebGL (@react-three/test-renderer), avançando quadros de verdade.
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { createRef, type MutableRefObject } from 'react';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { toCampus } from '../Domain/Campus';
import { DEFAULT_FOLLOW } from '../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../Domain/Movement';
import { toNpcs } from '../Domain/Npc';
import campusData from '../Content/campus.json';
import npcsData from '../Content/npcs.json';
import { Npc3D } from '../Presentation/Engine3D/Npc3D';
import { AvatarController } from '../Presentation/Engine3D/AvatarController';
import { ThirdPersonCamera } from '../Presentation/Engine3D/ThirdPersonCamera';
import { MESSAGES, translate } from '../Presentation/i18n/I18n';

const campus = toCampus(campusData);
const npcs = toNpcs(npcsData, campus);
const FORWARD: MoveInput = { forward: true, backward: false, left: false, right: false };

const mount = async (active: boolean) => {
  const stateRef = createRef<AvatarState>() as MutableRefObject<AvatarState>;
  stateRef.current = { ...campus.start };
  const camera = new PerspectiveCamera();
  camera.position.set(0, 4, 17);
  const r = await ReactThreeTestRenderer.create(
    <>
      <AvatarController campus={campus} active={active} stateRef={stateRef} readInput={() => FORWARD} />
      <ThirdPersonCamera stateRef={stateRef} />
    </>,
    { camera },
  );
  return { r, stateRef, camera };
};

describe('avatar na cena', () => {
  it('segurar "frente" move o avatar no grafo e a câmera vem atrás', async () => {
    const { r, stateRef, camera } = await mount(true);
    await r.advanceFrames(30, 1 / 30); // 1 s
    const avatar = r.scene.findByProps({ name: 'avatar' }).instance;
    expect(avatar.position.z).toBeCloseTo(campus.start.z - 6, 0);
    expect(stateRef.current.z).toBeCloseTo(avatar.position.z);
    // A câmera saiu de z=17 e foi para perto do ponto atrás do avatar (que olha para -z): avatar.z + distância.
    expect(Math.abs(camera.position.z - (avatar.position.z + DEFAULT_FOLLOW.distance))).toBeLessThan(1);
    expect(camera.position.y).toBeCloseTo(DEFAULT_FOLLOW.height, 0);
  });

  it('fora do modo Avatar as teclas não movem o personagem', async () => {
    const { r } = await mount(false);
    await r.advanceFrames(30, 1 / 30);
    expect(r.scene.findByProps({ name: 'avatar' }).instance.position.z).toBe(campus.start.z);
  });

  it('todo prédio e todo NPC tem rótulo nos dois idiomas; todo NPC tem saudação', () => {
    for (const b of [...campus.buildings, ...npcs]) {
      for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
        expect(translate(lang, b.labelKey), `${lang}:${b.labelKey}`).not.toBe(b.labelKey);
      }
    }
    for (const n of npcs) for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) expect(translate(lang, `npcs.${n.id}.greeting`)).not.toContain('npcs.');
  });
});

describe('NPC na cena', () => {
  const mountNpc = async (avatar: AvatarState) => {
    const avatarRef = { current: avatar } as MutableRefObject<AvatarState>;
    const r = await ReactThreeTestRenderer.create(<Npc3D npc={npcs[0]} label="Guia" avatarRef={avatarRef} />);
    return r;
  };
  const bodyAngle = (r: Awaited<ReturnType<typeof mountNpc>>) => r.scene.findByProps({ name: 'npc:guia:corpo' }).instance.rotation.y;

  it('com o avatar perto, o NPC vira para ele', async () => {
    const r = await mountNpc({ x: 3, z: 7, heading: 0 }); // à direita do Guia (que está em 0, 7): +x
    await r.advanceFrames(60, 1 / 30);
    expect(bodyAngle(r)).toBeCloseTo(Math.PI / 2, 2);
  });

  it('com o avatar longe, o NPC fica como está', async () => {
    const r = await mountNpc({ x: 0, z: -7, heading: 0 });
    await r.advanceFrames(30, 1 / 30);
    expect(bodyAngle(r)).toBe(0);
  });
});

describe('visão orbital', () => {
  it('ao entrar no modo Orbital, a câmera sobe para a vista geral do mapa', async () => {
    const { OrbitCamera, OVERVIEW } = await import('../Presentation/Engine3D/OrbitCamera');
    const camera = new PerspectiveCamera();
    camera.position.set(0, 4.5, 17); // atrás do avatar
    await ReactThreeTestRenderer.create(<OrbitCamera />, { camera });
    expect(camera.position.toArray()).toEqual(OVERVIEW);
  });
});
