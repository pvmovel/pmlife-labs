// Liga o teclado (KeyboardControls) e o joystick de toque ao avatar: o campus e a sala interna (US32) usam o mesmo.
import type { MutableRefObject } from 'react';
import { useKeyboardControls } from '@react-three/drei';
import type { Campus } from '../../Domain/Campus';
import type { AvatarState, MoveInput } from '../../Domain/Movement';
import { combineInputs, STILL } from '../../Domain/TouchJoystick';
import { AvatarController } from './AvatarController';
import type { Control } from './controls';

const noTouch = () => STILL;

export function KeyboardAvatar({
  campus,
  active,
  stateRef,
  onMove,
  touchInput = noTouch,
}: {
  campus: Campus;
  active: boolean;
  stateRef: MutableRefObject<AvatarState>;
  onMove?: (state: AvatarState) => void;
  touchInput?: () => MoveInput;
}) {
  const [, get] = useKeyboardControls<Control>();
  const readInput = () => combineInputs(get() as MoveInput, touchInput());
  return <AvatarController campus={campus} active={active} stateRef={stateRef} readInput={readInput} onMove={onMove} />;
}
