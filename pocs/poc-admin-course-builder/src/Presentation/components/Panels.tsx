// Os painéis do editor do curso (US49): o curso (título, atributos e a escada de níveis), as fases (a ordem, os
// pré-requisitos e os prédios) e as missões de cada fase (título, prédio, XP e pontos). Cada campo tem o caminho do
// validador (`data-path`): o problema leva ao campo, e o campo com problema fica marcado. Os textos se editam nos dois
// idiomas. As edições são as do Domain (puras).
import { useId, type ReactNode } from 'react';
import { DEMO_INSTITUTION } from '../../Content/institution';
import type { Course, Points, Text2 } from '../../Domain/Course';
import {
  addBuilding,
  addLevel,
  addPhase,
  addQuest,
  movePhase,
  removeLevel,
  removePhase,
  removeQuest,
  setTitle,
  toggleAttribute,
  toggleRequirement,
  updateLevel,
  updatePhase,
  updateQuest,
} from '../../Domain/editing';
import type { MessageKey } from '../../Content/Locales/pt-BR';
import { useI18n } from '../i18n';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;
type Edit = (change: (c: Course) => Course) => void;

/** O nome de um texto no idioma da tela. */
export const say = (text: Text2, language: string) => (language === 'pt-BR' ? text.pt : text.en);
const attrName = (id: string, language: string) => {
  const a = DEMO_INSTITUTION.attributes.find((x) => x.id === id);
  return a ? say(a.label, language) : id;
};

function TextPair({ path, value, labels, bad, onChange, disabled }: { path: string; value: Text2; labels: [string, string]; bad: (p: string) => boolean; onChange: (v: Text2) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="field-row">
      <div className="field">
        <label htmlFor={`${id}-pt`}>{labels[0]}</label>
        <input id={`${id}-pt`} data-path={path} value={value.pt} disabled={disabled} aria-invalid={bad(path) || undefined} onChange={(e) => onChange({ ...value, pt: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-en`}>{labels[1]}</label>
        <input id={`${id}-en`} value={value.en} disabled={disabled} aria-invalid={bad(path) || undefined} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </div>
    </div>
  );
}

function NumberInput({ path, label, value, bad, onChange, disabled, min }: { path: string; label: string; value: number; bad: (p: string) => boolean; onChange: (n: number) => void; disabled: boolean; min?: number }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-path={path}
        type="number"
        inputMode="numeric"
        min={min}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={bad(path) || undefined}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <header className="card-head">
        <h3>{title}</h3>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Os pontos de atributo (um campo por atributo do curso). */
function PointsFields({ base, points, attributes, label, bad, onChange, disabled, lead }: { base: string; points: Points; attributes: readonly string[]; label: (name: string) => string; bad: (p: string) => boolean; onChange: (p: Points) => void; disabled: boolean; lead?: ReactNode }) {
  const { language } = useI18n();
  if (attributes.length === 0 && !lead) return null;
  return (
    <div className="field-row wrap">
      {lead}
      {attributes.map((a) => (
        <NumberInput key={a} path={`${base}/${a}`} label={label(attrName(a, language))} value={points[a] ?? 0} min={0} bad={bad} disabled={disabled} onChange={(n) => onChange({ ...points, [a]: n })} />
      ))}
    </div>
  );
}

export interface PanelProps {
  course: Course;
  edit: Edit;
  bad: (path: string) => boolean;
  disabled: boolean;
}

export function CoursePanel({ course, edit, bad, disabled }: PanelProps) {
  const { t, language } = useI18n();
  return (
    <>
      <Card title={t('course.heading')}>
        <TextPair path="/title" value={course.title} labels={[t('course.titlePt'), t('course.titleEn')]} bad={bad} disabled={disabled} onChange={(v) => edit((c) => setTitle(c, v))} />
        <fieldset className="checks" data-path="/attributes">
          <legend>{t('course.attributes')}</legend>
          <p className="hint">{t('course.attributesHint')}</p>
          {DEMO_INSTITUTION.attributes.map((a) => (
            <label key={a.id} className="check">
              <input type="checkbox" checked={course.attributes.includes(a.id)} disabled={disabled} onChange={() => edit((c) => toggleAttribute(c, a.id))} /> {say(a.label, language)}
            </label>
          ))}
        </fieldset>
      </Card>
      <h2 className="panel-heading">{t('levels.heading')}</h2>
      <p className="hint">{t('levels.hint')}</p>
      {course.levels.map((l, i) => (
        <Card
          key={l.id}
          title={t('levels.level', { n: i + 1 })}
          actions={
            !disabled && i > 0 ? (
              <button type="button" className="button danger-ghost" onClick={() => edit((c) => removeLevel(c, i))} aria-label={`${t('levels.remove')}: ${t('levels.level', { n: i + 1 })}`}>
                {t('levels.remove')}
              </button>
            ) : undefined
          }
        >
          <TextPair path={`/levels/${i}/label`} value={l.label} labels={[t('levels.namePt'), t('levels.nameEn')]} bad={bad} disabled={disabled} onChange={(v) => edit((c) => updateLevel(c, i, { label: v }))} />
          <PointsFields
            base={`/levels/${i}/attributes`}
            points={l.attributes}
            attributes={course.attributes}
            label={(a) => t('levels.minAttr', { attribute: a })}
            bad={bad}
            disabled={disabled}
            onChange={(p) => edit((c) => updateLevel(c, i, { attributes: p }))}
            lead={<NumberInput path={`/levels/${i}/minXp`} label={t('levels.minXp')} value={l.minXp} min={0} bad={bad} disabled={disabled} onChange={(n) => edit((c) => updateLevel(c, i, { minXp: n }))} />}
          />
          <fieldset className="checks" data-path={`/levels/${i}/phases`}>
            <legend>{t('levels.phases')}</legend>
            {course.phases.map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={l.phases.includes(p.id)}
                  disabled={disabled}
                  onChange={() => edit((c) => updateLevel(c, i, { phases: l.phases.includes(p.id) ? l.phases.filter((x) => x !== p.id) : [...l.phases, p.id] }))}
                />{' '}
                {say(p.title, language)}
              </label>
            ))}
          </fieldset>
        </Card>
      ))}
      {!disabled && (
        <button type="button" className="button" onClick={() => edit((c) => addLevel(c, { pt: t('levels.newPt'), en: t('levels.newEn') }))}>
          {t('levels.add')}
        </button>
      )}
    </>
  );
}

export function PhasesPanel({ course, edit, bad, disabled }: PanelProps) {
  const { t, language } = useI18n();
  return (
    <>
      <h2 className="panel-heading">{t('phases.heading')}</h2>
      <p className="hint">{t('phases.hint')}</p>
      {course.phases.map((p, i) => {
        const name = say(p.title, language) || t('phases.phase', { n: i + 1 });
        const others = course.phases.filter((x) => x.id !== p.id);
        return (
          <Card
            key={p.id}
            title={t('phases.phase', { n: i + 1 })}
            actions={
              !disabled && (
                <>
                  <button type="button" className="icon-button" disabled={i === 0} onClick={() => edit((c) => movePhase(c, i, -1))} aria-label={t('phases.up', { name })}>
                    ↑
                  </button>
                  <button type="button" className="icon-button" disabled={i === course.phases.length - 1} onClick={() => edit((c) => movePhase(c, i, 1))} aria-label={t('phases.down', { name })}>
                    ↓
                  </button>
                  {course.phases.length > 1 && (
                    <button type="button" className="button danger-ghost" onClick={() => edit((c) => removePhase(c, i))} aria-label={`${t('phases.remove')}: ${name}`}>
                      {t('phases.remove')}
                    </button>
                  )}
                </>
              )
            }
          >
            <TextPair path={`/phases/${i}/title`} value={p.title} labels={[t('phases.titlePt'), t('phases.titleEn')]} bad={bad} disabled={disabled} onChange={(v) => edit((c) => updatePhase(c, i, { title: v }))} />
            <fieldset className="checks" data-path={`/phases/${i}/requires`} aria-invalid={bad(`/phases/${i}/requires`) || undefined}>
              <legend>{t('phases.requires')}</legend>
              {others.length === 0 && <p className="hint">{t('phases.requiresNone')}</p>}
              {others.map((o) => (
                <label key={o.id} className="check">
                  <input type="checkbox" checked={p.requires.includes(o.id)} disabled={disabled} onChange={() => edit((c) => toggleRequirement(c, i, o.id))} /> {say(o.title, language)}
                </label>
              ))}
            </fieldset>
            <div className="field" data-path={`/phases/${i}/buildings`}>
              <span className="label">{t('phases.buildings')}</span>
              <p className="hint">{p.buildings.map((b) => say(b.label, language)).join(', ') || '—'}</p>
              {!disabled && (
                <button type="button" className="button" onClick={() => edit((c) => addBuilding(c, i, { pt: t('phases.newBuildingPt'), en: t('phases.newBuildingEn') }))} aria-label={`${t('phases.addBuilding')}: ${name}`}>
                  {t('phases.addBuilding')}
                </button>
              )}
            </div>
            <p className="hint">{t('phases.quests', { count: p.quests.length })}</p>
          </Card>
        );
      })}
      {!disabled && (
        <button
          type="button"
          className="button"
          onClick={() =>
            edit((c) => addPhase(c, { pt: t('phases.newPt', { n: c.phases.length + 1 }), en: t('phases.newEn', { n: c.phases.length + 1 }) }, { pt: t('phases.newBuildingDefaultPt'), en: t('phases.newBuildingDefaultEn') }))
          }
        >
          {t('phases.add')}
        </button>
      )}
    </>
  );
}

export function QuestsPanel({ course, edit, bad, disabled, phase, setPhase }: PanelProps & { phase: number; setPhase: (i: number) => void }) {
  const { t, language } = useI18n();
  const id = useId();
  const p = course.phases[phase];
  if (!p) return null;
  return (
    <>
      <h2 className="panel-heading">{t('quests.heading')}</h2>
      <div className="field narrow">
        <label htmlFor={id}>{t('quests.phase')}</label>
        <select id={id} value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
          {course.phases.map((x, i) => (
            <option key={x.id} value={i}>
              {t('phases.phase', { n: i + 1 })}: {say(x.title, language)}
            </option>
          ))}
        </select>
      </div>
      {p.quests.length === 0 && <p className="hint">{t('quests.none')}</p>}
      {p.quests.map((q, j) => {
        const base = `/phases/${phase}/quests/${j}`;
        const known = p.buildings.some((b) => b.id === q.buildingId);
        return (
          <Card
            key={q.id}
            title={t('quests.quest', { n: j + 1 })}
            actions={
              !disabled && (
                <button type="button" className="button danger-ghost" onClick={() => edit((c) => removeQuest(c, phase, j))} aria-label={`${t('quests.remove')}: ${say(q.title, language)}`}>
                  {t('quests.remove')}
                </button>
              )
            }
          >
            <TextPair path={`${base}/title`} value={q.title} labels={[t('quests.titlePt'), t('quests.titleEn')]} bad={bad} disabled={disabled} onChange={(v) => edit((c) => updateQuest(c, phase, j, { title: v }))} />
            <div className="field-row">
              <BuildingSelect
                path={`${base}/buildingId`}
                value={q.buildingId}
                options={p.buildings.map((b) => ({ id: b.id, name: say(b.label, language) }))}
                missing={known ? null : t('quests.buildingMissing')}
                label={t('quests.building')}
                bad={bad}
                disabled={disabled}
                onChange={(b) => edit((c) => updateQuest(c, phase, j, { buildingId: b }))}
              />
              <NumberInput path={`${base}/xp`} label={t('quests.xp')} value={q.xp} min={1} bad={bad} disabled={disabled} onChange={(n) => edit((c) => updateQuest(c, phase, j, { xp: n }))} />
            </div>
            <PointsFields base={`${base}/attributes`} points={q.attributes} attributes={course.attributes} label={(a) => t('quests.points', { attribute: a })} bad={bad} disabled={disabled} onChange={(pts) => edit((c) => updateQuest(c, phase, j, { attributes: pts }))} />
          </Card>
        );
      })}
      {!disabled && (
        <button type="button" className="button" onClick={() => edit((c) => addQuest(c, phase, { pt: t('quests.newPt'), en: t('quests.newEn') }).course)}>
          {t('quests.add')}
        </button>
      )}
    </>
  );
}

function BuildingSelect({ path, value, options, missing, label, bad, disabled, onChange }: { path: string; value: string; options: { id: string; name: string }[]; missing: string | null; label: string; bad: (p: string) => boolean; disabled: boolean; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} data-path={path} value={value} disabled={disabled} aria-invalid={bad(path) || undefined} onChange={(e) => onChange(e.target.value)}>
        {missing !== null && <option value={value}>{missing}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** O lugar de um problema, para a lista: o curso, um nível, uma fase ou uma missão. */
export function problemPlace(path: string, t: T): string {
  const q = /^\/phases\/(\d+)\/quests\/(\d+)/.exec(path);
  if (q) return t('problems.quest', { q: Number(q[2]) + 1, n: Number(q[1]) + 1 });
  const p = /^\/phases\/(\d+)/.exec(path);
  if (p) return t('problems.phase', { n: Number(p[1]) + 1 });
  const l = /^\/levels\/(\d+)/.exec(path);
  if (l) return t('problems.level', { n: Number(l[1]) + 1 });
  return t('problems.course');
}
