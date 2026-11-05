// Teclas do avatar: WASD e setas fazem a mesma coisa (mapa do KeyboardControls do drei).
import type { KeyboardControlsEntry } from '@react-three/drei';

export type Control = 'forward' | 'backward' | 'left' | 'right';

export const KEY_MAP: KeyboardControlsEntry<Control>[] = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
];
