// Joystick de toque (US29): base fixa no canto inferior esquerdo da cena e um pino que segue o dedo.
// Pointer Events com captura: o dedo pode sair da base sem soltar o joystick, e um segundo dedo (pinça, toque num
// botão) não o sequestra. A entrada vai para um ref lido a cada quadro pelo avatar, sem re-render da cena.
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { clampToRadius, joystickToMoveInput, STILL } from '../../Domain/TouchJoystick';
import type { MoveInput } from '../../Domain/Movement';
import { useI18n } from '../i18n/I18n';

const RADIUS = 56; // px: metade da base (112 px), confortável para o polegar

const active = (input: MoveInput) => (Object.keys(input) as (keyof MoveInput)[]).filter((k) => input[k]).join(',');

export function TouchJoystick({ inputRef }: { inputRef: MutableRefObject<MoveInput> }) {
  const { t } = useI18n();
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ dx: 0, dy: 0 });
  const [input, setInput] = useState<MoveInput>(STILL);

  const apply = (next: MoveInput, offset: { dx: number; dy: number }) => {
    inputRef.current = next;
    setInput(next);
    setKnob(offset);
  };

  const follow = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const offset = clampToRadius(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2), RADIUS);
    apply(joystickToMoveInput(offset.dx / RADIUS, offset.dy / RADIUS), offset);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    follow(e);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === pointer.current) follow(e);
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    apply(STILL, { dx: 0, dy: 0 });
  };

  // Ao sumir (abriu uma janela, trocou para o Orbital), o avatar não pode continuar andando sozinho.
  useEffect(() => () => void (inputRef.current = STILL), [inputRef]);

  return (
    <div
      className="joystick"
      data-testid="joystick"
      data-input={active(input)}
      // O joystick só serve ao toque; teclado e leitor de tela usam as teclas e os botões do aviso.
      aria-hidden="true"
      title={t('joystick.label')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
    </div>
  );
}
