// Carregado com React.lazy: three + fiber + drei num chunk separado.
import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import type { Campus } from '../../Domain/Campus';
import { cameraTarget } from '../../Domain/FollowCamera';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import type { NavigationMode } from '../NavigationModeToggle';
import { Building3D } from './Building3D';
import { KEY_MAP } from './controls';
import { KeyboardAvatar } from './KeyboardAvatar';
import { OrbitCamera } from './OrbitCamera';
import { ProximityTrigger } from './ProximityTrigger';
import { ThirdPersonCamera } from './ThirdPersonCamera';

interface Props {
  campus: Campus;
  mode: NavigationMode;
  labelOf: (labelKey: string) => string;
  ariaLabel: string;
  onMove?: (state: AvatarState) => void;
  /** Prédio no alcance do avatar mudou (US21). */
  onNearbyChange: (buildingId: string | null) => void;
  /** Prédio destacado: o do alcance (Avatar) ou o selecionado (Orbital). */
  highlightedId: string | null;
  /** Modo Orbital: clicar ou tocar num prédio o seleciona (US27). Sem isto, os prédios não são clicáveis. */
  onSelect?: (buildingId: string) => void;
  /** Com uma janela aberta, o avatar fica parado. */
  locked: boolean;
  /** Entrada do joystick de toque (US29), somada à do teclado a cada quadro. */
  touchInput?: () => MoveInput;
}

export default function AvatarCanvas({ campus, mode, labelOf, ariaLabel, onMove, onNearbyChange, highlightedId, onSelect, locked, touchInput }: Props) {
  const stateRef = useRef<AvatarState>({ ...campus.start });
  const start = cameraTarget(campus.start);
  const side = campus.halfSize * 2;

  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas
        shadows
        // Com o avatar há animação a cada quadro; na visão orbital, só redesenha quando a câmera muda.
        frameloop={mode === 'avatar' ? 'always' : 'demand'}
        dpr={[1, 2]}
        camera={{ position: [start.x, start.y, start.z], fov: 50 }}
        role="img"
        aria-label={ariaLabel}
      >
        <color attach="background" args={['#0b1120']} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[12, 22, 10]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-campus.halfSize}
          shadow-camera-right={campus.halfSize}
          shadow-camera-top={campus.halfSize}
          shadow-camera-bottom={-campus.halfSize}
        />
        <mesh name="chao" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[side, side]} />
          <meshStandardMaterial color="#3b4a63" />
        </mesh>
        <gridHelper args={[side, side / 2, '#66d9e8', '#4c5d7a']} position={[0, 0.01, 0]} />
        <Suspense fallback={null}>
          {campus.buildings.map((b) => (
            <Building3D key={b.id} building={b} label={labelOf(b.labelKey)} highlighted={b.id === highlightedId} onSelect={onSelect} />
          ))}
        </Suspense>
        <KeyboardAvatar campus={campus} active={mode === 'avatar' && !locked} stateRef={stateRef} onMove={onMove} touchInput={touchInput} />
        <ProximityTrigger campus={campus} stateRef={stateRef} onChange={onNearbyChange} />
        {mode === 'avatar' ? <ThirdPersonCamera stateRef={stateRef} /> : <OrbitCamera />}
      </Canvas>
    </KeyboardControls>
  );
}
