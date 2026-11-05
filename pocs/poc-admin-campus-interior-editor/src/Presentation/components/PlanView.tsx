// A planta vista de cima (SVG, em metros): a cidade (prédios e ponto de chegada) ou a sala de um prédio (porta, estações
// e objetos de parede). Cada item é um botão: clicar seleciona; arrastar (mouse ou toque) move na grade; as setas do
// teclado movem meio metro (com Shift, 2 m); Delete tira; Enter num prédio abre o interior. O item com problema fica
// marcado em vermelho, e o leitor de tela ouve o nome, a posição e o problema.
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Selection } from '../../Domain/editing';
import { GEOMETRY, type Interior, type Wall, type World } from '../../Domain/World';
import { useI18n } from '../i18n';
import type { View } from '../useEditor';

const sameSel = (a: Selection | null, b: Selection) => a !== null && a.type === b.type && ('id' in a ? 'id' in b && a.id === b.id : true);

export interface PlanProps {
  world: World;
  view: View;
  selection: Selection | null;
  /** Os caminhos com problema (`/buildings/0`, `/interiors/0/stations/1`...). */
  problemPaths: ReadonlySet<string>;
  editable: boolean;
  onSelect: (sel: Selection | null) => void;
  /** Leva o item para a posição (em metros) do ponteiro. */
  onDragTo: (sel: Selection, x: number, z: number) => void;
  onNudge: (sel: Selection, dx: number, dz: number) => void;
  onDelete: (sel: Selection) => void;
  onOpenInterior: (buildingId: string) => void;
}

export function PlanView(props: PlanProps) {
  const { world, view } = props;
  if (view.kind === 'interior') {
    const index = world.interiors.findIndex((i) => i.buildingId === view.buildingId);
    const room = world.interiors[index];
    return room ? <RoomPlan {...props} room={room} index={index} /> : null;
  }
  return <CityPlan {...props} />;
}

/** O SVG da planta, com a conversão do ponteiro para metros e o arrastar. */
function Plan({ half, label, children, onBackground }: { half: number; label: string; children: (drag: DragApi) => ReactNode; onBackground: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ sel: Selection; to: (x: number, z: number) => void; moved: boolean } | null>(null);
  const toMeters = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!svg.current || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, z: p.y };
  };
  const api: DragApi = {
    start: (e, sel, to) => {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      dragging.current = { sel, to, moved: false };
    },
  };
  const margin = 1.5;
  return (
    <svg
      ref={svg}
      className="plan"
      viewBox={`${-half - margin} ${-half - margin} ${2 * (half + margin)} ${2 * (half + margin)}`}
      role="group"
      aria-label={label}
      onPointerMove={(e) => {
        const d = dragging.current;
        const p = d && toMeters(e);
        if (d && p) {
          d.moved = true;
          d.to(p.x, p.z);
        }
      }}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      onPointerDown={(e) => e.target === e.currentTarget && onBackground()}
    >
      {children(api)}
    </svg>
  );
}

interface DragApi {
  start: (e: PointerEvent, sel: Selection, to: (x: number, z: number) => void) => void;
}

/** As teclas de um item da planta. */
function keys(props: PlanProps, sel: Selection, opts: { horizontalOnly?: boolean; open?: () => void } = {}) {
  return (e: KeyboardEvent) => {
    const step = e.shiftKey ? 2 : GEOMETRY.grid;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key in delta && props.editable) {
      e.preventDefault();
      const [dx, dz] = delta[e.key];
      props.onSelect(sel);
      props.onNudge(sel, opts.horizontalOnly ? dx + dz : dx, opts.horizontalOnly ? 0 : dz);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && props.editable) {
      e.preventDefault();
      props.onDelete(sel);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.key === 'Enter' && opts.open) opts.open();
      else props.onSelect(sel);
    }
  };
}

function CityPlan(props: PlanProps) {
  const { t, language } = useI18n();
  const { world, selection, problemPaths, editable } = props;
  const H = world.halfSize;
  const lang = language === 'pt-BR' ? 'pt' : 'en';
  const spawnSel: Selection = { type: 'spawn' };
  return (
    <Plan half={H} label={t('plan.cityLabel', { size: 2 * H })} onBackground={() => props.onSelect(null)}>
      {(drag) => (
        <>
          <Grid half={H} />
          <rect className="map-edge" x={-H} y={-H} width={2 * H} height={2 * H} />
          {world.buildings.map((b, i) => {
            const sel: Selection = { type: 'building', id: b.id };
            const bad = problemPaths.has(`/buildings/${i}`);
            const name = b.label[lang];
            return (
              <g
                key={b.id}
                className={`item building${sameSel(selection, sel) ? ' selected' : ''}${bad ? ' bad' : ''}`}
                role="button"
                tabIndex={0}
                data-item={b.id}
                aria-pressed={sameSel(selection, sel)}
                aria-label={t('plan.building', { name, x: b.x, z: b.z }) + (b.role ? `, ${t('plan.required')}` : '') + (bad ? `, ${t('plan.hasProblem')}` : '')}
                onPointerDown={(e) => {
                  props.onSelect(sel);
                  if (editable) {
                    const ox = b.x;
                    const oz = b.z;
                    let start: { x: number; z: number } | null = null;
                    drag.start(e, sel, (x, z) => {
                      start ??= { x, z };
                      props.onDragTo(sel, ox + x - start.x, oz + z - start.z);
                    });
                  }
                }}
                onDoubleClick={() => props.onOpenInterior(b.id)}
                onKeyDown={keys(props, sel, { open: () => props.onOpenInterior(b.id) })}
              >
                <rect x={b.x - b.width / 2} y={b.z - b.depth / 2} width={b.width} height={b.depth} fill={b.color} />
                <text x={b.x} y={b.z} textAnchor="middle" dominantBaseline="middle">
                  {name.length > 14 ? `${name.slice(0, 13)}…` : name}
                </text>
              </g>
            );
          })}
          <g
            className={`item spawn${sameSel(selection, spawnSel) ? ' selected' : ''}${problemPaths.has('/spawn') ? ' bad' : ''}`}
            role="button"
            tabIndex={0}
            data-item="spawn"
            aria-pressed={sameSel(selection, spawnSel)}
            aria-label={t('plan.spawn', { x: world.spawn.x, z: world.spawn.z })}
            onPointerDown={(e) => {
              props.onSelect(spawnSel);
              if (editable) drag.start(e, spawnSel, (x, z) => props.onDragTo(spawnSel, x, z));
            }}
            onKeyDown={keys(props, spawnSel)}
          >
            <circle cx={world.spawn.x} cy={world.spawn.z} r={0.8} />
            <text x={world.spawn.x} y={world.spawn.z + 2} textAnchor="middle">
              {t('plan.spawnShort')}
            </text>
          </g>
        </>
      )}
    </Plan>
  );
}

/** Onde um objeto de parede fica na planta: o centro e o sentido da parede. */
export function wallPoint(room: Interior, wall: Wall, offset: number): { x: number; z: number; horizontal: boolean } {
  const H = room.halfSize;
  if (wall === 'north') return { x: offset, z: -H, horizontal: true };
  if (wall === 'south') return { x: offset, z: H, horizontal: true };
  if (wall === 'east') return { x: H, z: offset, horizontal: false };
  return { x: -H, z: offset, horizontal: false };
}

function RoomPlan(props: PlanProps & { room: Interior; index: number }) {
  const { t, language } = useI18n();
  const { world, room, index, selection, problemPaths, editable } = props;
  const H = room.halfSize;
  const lang = language === 'pt-BR' ? 'pt' : 'en';
  const building = world.buildings.find((b) => b.id === room.buildingId);
  const questLabel = (id: string) => world.quests.find((q) => q.id === id)?.label[lang] ?? id;
  const { doorHalfWidth: dw, doorClearance, stationRadius: r } = GEOMETRY;
  return (
    <Plan half={H} label={t('plan.roomLabel', { name: building?.label[lang] ?? room.buildingId, size: 2 * H })} onBackground={() => props.onSelect(null)}>
      {(drag) => (
        <>
          <Grid half={H} />
          <rect className="room-floor" x={-H} y={-H} width={2 * H} height={2 * H} />
          {/* A faixa livre na frente da porta. */}
          <rect className="door-zone" x={room.doorX - dw} y={H - doorClearance} width={2 * dw} height={doorClearance} />
          <line className="door" x1={room.doorX - dw} y1={H} x2={room.doorX + dw} y2={H} />
          <text className="door-label" x={room.doorX} y={H + 1} textAnchor="middle">
            {t('plan.door')}
          </text>
          {room.wallItems.map((w, i) => {
            const sel: Selection = { type: 'wallItem', buildingId: room.buildingId, id: w.id };
            const bad = problemPaths.has(`/interiors/${index}/wallItems/${i}`);
            const p = wallPoint(room, w.wall, w.offset);
            return (
              <g
                key={w.id}
                className={`item wall-item${sameSel(selection, sel) ? ' selected' : ''}${bad ? ' bad' : ''}`}
                role="button"
                tabIndex={0}
                data-item={w.id}
                aria-pressed={sameSel(selection, sel)}
                aria-label={t('plan.wallItem', { text: w.text[lang], wall: t(`wall.${w.wall}`), offset: w.offset }) + (bad ? `, ${t('plan.hasProblem')}` : '')}
                onPointerDown={(e) => {
                  props.onSelect(sel);
                  if (editable) drag.start(e, sel, (x, z) => props.onDragTo(sel, x, z));
                }}
                onKeyDown={keys(props, sel, { horizontalOnly: true })}
              >
                {p.horizontal ? (
                  <rect x={p.x - w.width / 2} y={p.z - 0.3} width={w.width} height={0.6} />
                ) : (
                  <rect x={p.x - 0.3} y={p.z - w.width / 2} width={0.6} height={w.width} />
                )}
              </g>
            );
          })}
          {room.stations.map((s, i) => {
            const sel: Selection = { type: 'station', buildingId: room.buildingId, id: s.id };
            const bad = problemPaths.has(`/interiors/${index}/stations/${i}`);
            return (
              <g
                key={s.id}
                className={`item station${sameSel(selection, sel) ? ' selected' : ''}${bad ? ' bad' : ''}`}
                role="button"
                tabIndex={0}
                data-item={s.id}
                aria-pressed={sameSel(selection, sel)}
                aria-label={t('plan.station', { n: i + 1, quest: questLabel(s.questId), x: s.x, z: s.z }) + (bad ? `, ${t('plan.hasProblem')}` : '')}
                onPointerDown={(e) => {
                  props.onSelect(sel);
                  if (editable) drag.start(e, sel, (x, z) => props.onDragTo(sel, x, z));
                }}
                onKeyDown={keys(props, sel)}
              >
                <circle cx={s.x} cy={s.z} r={r} />
                <text x={s.x} y={s.z} textAnchor="middle" dominantBaseline="middle">
                  {i + 1}
                </text>
              </g>
            );
          })}
        </>
      )}
    </Plan>
  );
}

function Grid({ half }: { half: number }) {
  const lines = [];
  for (let v = -half; v <= half; v += 2) {
    lines.push(<line key={`v${v}`} x1={v} y1={-half} x2={v} y2={half} />, <line key={`h${v}`} x1={-half} y1={v} x2={half} y2={v} />);
  }
  return (
    <g className="grid" aria-hidden="true">
      {lines}
    </g>
  );
}
