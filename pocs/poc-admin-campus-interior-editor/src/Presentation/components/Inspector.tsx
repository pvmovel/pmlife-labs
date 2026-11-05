// O painel ao lado da planta: os campos do item selecionado (prédio, ponto de chegada, estação ou objeto de parede) ou,
// sem seleção, os da cidade ou da sala, com os botões de acrescentar. Os números andam na grade (o Domain arredonda).
// Num documento só de leitura (da plataforma, ou na visão do aluno), os campos ficam desligados.
import { useId, useState, type ReactNode } from 'react';
import {
  addBuilding,
  addStation,
  addWallItem,
  ensureInterior,
  removeBuilding,
  removeStation,
  removeWallItem,
  updateBuilding,
  updateInterior,
  updateStation,
  updateWallItem,
  moveSpawn,
  WALLS,
  type Selection,
} from '../../Domain/editing';
import type { Wall, World } from '../../Domain/World';
import { useI18n } from '../i18n';
import type { View } from '../useEditor';

interface Props {
  world: World;
  view: View;
  selection: Selection | null;
  editable: boolean;
  edit: (change: (w: World) => World) => void;
  select: (sel: Selection | null) => void;
  setView: (view: View) => void;
  notify: (message: string) => void;
}

function NumberField({ label, value, onChange, disabled, step = 0.5, min }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean; step?: number; min?: number }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}

function TextField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} disabled={disabled} maxLength={40} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Inspector({ world, view, selection, editable, edit, select, setView, notify }: Props) {
  const { t, language } = useI18n();
  const lang = language === 'pt-BR' ? 'pt' : 'en';
  const ids = { quest: useId(), wall: useId(), color: useId() };
  const off = !editable;

  if (selection?.type === 'building') {
    const b = world.buildings.find((x) => x.id === selection.id);
    if (!b) return null;
    const set = (patch: Parameters<typeof updateBuilding>[2]) => edit((w) => updateBuilding(w, b.id, patch));
    return (
      <Section title={t('inspector.building', { name: b.label[lang] })}>
        {b.role && <p className="hint">{t('inspector.required')}</p>}
        <TextField label={t('inspector.namePt')} value={b.label.pt} disabled={off} onChange={(pt) => set({ label: { ...b.label, pt } })} />
        <TextField label={t('inspector.nameEn')} value={b.label.en} disabled={off} onChange={(en) => set({ label: { ...b.label, en } })} />
        <div className="field-row">
          <NumberField label={t('inspector.x')} value={b.x} disabled={off} onChange={(x) => set({ x })} />
          <NumberField label={t('inspector.z')} value={b.z} disabled={off} onChange={(z) => set({ z })} />
        </div>
        <div className="field-row">
          <NumberField label={t('inspector.width')} value={b.width} min={0.5} disabled={off} onChange={(width) => set({ width })} />
          <NumberField label={t('inspector.depth')} value={b.depth} min={0.5} disabled={off} onChange={(depth) => set({ depth })} />
          <NumberField label={t('inspector.height')} value={b.height} min={0.5} disabled={off} onChange={(height) => set({ height })} />
        </div>
        <div className="field">
          <label htmlFor={ids.color}>{t('inspector.color')}</label>
          <input id={ids.color} type="color" value={b.color} disabled={off} onChange={(e) => set({ color: e.target.value })} />
        </div>
        <div className="inspector-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              if (editable) edit((w) => ensureInterior(w, b.id));
              setView({ kind: 'interior', buildingId: b.id });
            }}
            disabled={!editable && !world.interiors.some((i) => i.buildingId === b.id)}
          >
            {t('inspector.openInterior')}
          </button>
          {editable && (
            <button
              type="button"
              className="button danger-ghost"
              disabled={Boolean(b.role)}
              onClick={() => {
                const next = removeBuilding(world, b.id);
                if (next) {
                  edit(() => next);
                  select(null);
                  notify(t('inspector.removed', { name: b.label[lang] }));
                }
              }}
            >
              {t('inspector.removeBuilding')}
            </button>
          )}
        </div>
      </Section>
    );
  }

  if (selection?.type === 'spawn') {
    return (
      <Section title={t('inspector.spawn')}>
        <p className="hint">{t('inspector.spawnHint')}</p>
        <div className="field-row">
          <NumberField label={t('inspector.x')} value={world.spawn.x} disabled={off} onChange={(x) => edit((w) => moveSpawn(w, x, w.spawn.z))} />
          <NumberField label={t('inspector.z')} value={world.spawn.z} disabled={off} onChange={(z) => edit((w) => moveSpawn(w, w.spawn.x, z))} />
        </div>
      </Section>
    );
  }

  if (selection?.type === 'station') {
    const room = world.interiors.find((i) => i.buildingId === selection.buildingId);
    const index = room?.stations.findIndex((s) => s.id === selection.id) ?? -1;
    const s = room?.stations[index];
    if (!room || !s) return null;
    const quests = world.quests.filter((q) => q.buildingId === room.buildingId);
    const set = (patch: Parameters<typeof updateStation>[3]) => edit((w) => updateStation(w, room.buildingId, s.id, patch));
    return (
      <Section title={t('inspector.station', { n: index + 1 })}>
        <div className="field">
          <label htmlFor={ids.quest}>{t('inspector.quest')}</label>
          <select id={ids.quest} value={s.questId} disabled={off} onChange={(e) => set({ questId: e.target.value })}>
            {!quests.some((q) => q.id === s.questId) && <option value={s.questId}>{s.questId}</option>}
            {quests.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <NumberField label={t('inspector.x')} value={s.x} disabled={off} onChange={(x) => set({ x })} />
          <NumberField label={t('inspector.z')} value={s.z} disabled={off} onChange={(z) => set({ z })} />
        </div>
        {editable && (
          <button
            type="button"
            className="button danger-ghost"
            onClick={() => {
              edit((w) => removeStation(w, room.buildingId, s.id));
              select(null);
            }}
          >
            {t('inspector.removeStation')}
          </button>
        )}
      </Section>
    );
  }

  if (selection?.type === 'wallItem') {
    const room = world.interiors.find((i) => i.buildingId === selection.buildingId);
    const item = room?.wallItems.find((x) => x.id === selection.id);
    if (!room || !item) return null;
    const set = (patch: Parameters<typeof updateWallItem>[3]) => edit((w) => updateWallItem(w, room.buildingId, item.id, patch));
    return (
      <Section title={t('inspector.wallItem')}>
        <p className="hint">{t('inspector.wallItemHint')}</p>
        <div className="field">
          <label htmlFor={ids.wall}>{t('inspector.wall')}</label>
          <select id={ids.wall} value={item.wall} disabled={off} onChange={(e) => set({ wall: e.target.value as Wall })}>
            {WALLS.map((w) => (
              <option key={w} value={w}>
                {t(`wall.${w}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <NumberField label={t('inspector.offset')} value={item.offset} disabled={off} onChange={(offset) => set({ offset })} />
          <NumberField label={t('inspector.width')} value={item.width} min={0.5} disabled={off} onChange={(width) => set({ width })} />
        </div>
        <TextField label={t('inspector.textPt')} value={item.text.pt} disabled={off} onChange={(pt) => set({ text: { ...item.text, pt } })} />
        <TextField label={t('inspector.textEn')} value={item.text.en} disabled={off} onChange={(en) => set({ text: { ...item.text, en } })} />
        {editable && (
          <button
            type="button"
            className="button danger-ghost"
            onClick={() => {
              edit((w) => removeWallItem(w, room.buildingId, item.id));
              select(null);
            }}
          >
            {t('inspector.removeWallItem')}
          </button>
        )}
      </Section>
    );
  }

  if (view.kind === 'interior') {
    const room = world.interiors.find((i) => i.buildingId === view.buildingId);
    if (!room) return null;
    return <RoomInspector world={world} buildingId={view.buildingId} editable={editable} edit={edit} select={select} notify={notify} />;
  }

  return (
    <Section title={t('inspector.city')}>
      <p className="hint">{t('inspector.cityHint')}</p>
      {editable && (
        <button
          type="button"
          className="button"
          onClick={() => {
            let id = '';
            edit((w) => {
              const r = addBuilding(w, { pt: t('inspector.newBuildingPt'), en: t('inspector.newBuildingEn') });
              id = r.id;
              return r.world;
            });
            if (id) select({ type: 'building', id });
          }}
        >
          {t('inspector.addBuilding')}
        </button>
      )}
    </Section>
  );
}

function RoomInspector({ world, buildingId, editable, edit, select, notify }: { world: World; buildingId: string; editable: boolean; edit: Props['edit']; select: Props['select']; notify: Props['notify'] }) {
  const { t, language } = useI18n();
  const lang = language === 'pt-BR' ? 'pt' : 'en';
  const questId = useId();
  const room = world.interiors.find((i) => i.buildingId === buildingId)!;
  const quests = world.quests.filter((q) => q.buildingId === buildingId);
  const [quest, setQuest] = useState(quests[0]?.id ?? '');
  const off = !editable;
  return (
    <Section title={t('inspector.room')}>
      <p className="hint">{t('inspector.roomHint')}</p>
      <div className="field-row">
        <NumberField label={t('inspector.roomSide')} value={room.halfSize * 2} step={1} disabled={off} onChange={(v) => edit((w) => updateInterior(w, buildingId, { halfSize: v / 2 }))} />
        <NumberField label={t('inspector.door')} value={room.doorX} disabled={off} onChange={(doorX) => edit((w) => updateInterior(w, buildingId, { doorX }))} />
      </div>
      {editable && (
        <>
          {quests.length === 0 ? (
            <p className="hint">{t('inspector.noQuests')}</p>
          ) : (
            <div className="field-row align-end">
              <div className="field">
                <label htmlFor={questId}>{t('inspector.quest')}</label>
                <select id={questId} value={quest} onChange={(e) => setQuest(e.target.value)}>
                  {quests.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label[lang]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => {
                  let id = '';
                  edit((w) => {
                    const r = addStation(w, buildingId, quest);
                    id = r.id;
                    return r.world;
                  });
                  if (id) {
                    select({ type: 'station', buildingId, id });
                    notify(t('inspector.stationAdded'));
                  }
                }}
              >
                {t('inspector.addStation')}
              </button>
            </div>
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              let id = '';
              edit((w) => {
                const r = addWallItem(w, buildingId, { pt: t('inspector.newBoardPt'), en: t('inspector.newBoardEn') });
                id = r.id;
                return r.world;
              });
              if (id) select({ type: 'wallItem', buildingId, id });
            }}
          >
            {t('inspector.addWallItem')}
          </button>
        </>
      )}
    </Section>
  );
}
