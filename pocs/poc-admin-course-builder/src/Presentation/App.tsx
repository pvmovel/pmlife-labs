// A PoC da US49: criar um curso do zero pelo admin. A tela Cursos da instituição (ainda sem nenhum), o "Novo curso"
// (o nome curto e o título; o curso nasce do modelo mínimo válido) e o editor do curso, com as abas do curso (título,
// atributos e a escada de níveis), das fases e das missões, os problemas na hora (cada um leva ao campo), o rascunho, a
// publicação validada e a visão do aluno. "Papel (demonstração)" mostra que só os masters criam cursos.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { DEMO_INSTITUTION } from '../Content/institution';
import type { Role } from '../Domain/Drafts';
import type { NewCourseError } from '../Domain/template';
import { phaseOrder } from '../Domain/validateCourse';
import { Dialog } from './components/Dialog';
import { CoursePanel, PhasesPanel, problemPlace, QuestsPanel, say } from './components/Panels';
import { useI18n, type Language } from './i18n';
import type { MessageKey } from '../Content/Locales/pt-BR';
import { useBuilder, type Builder, type Tab } from './useBuilder';

const ROLES: readonly Role[] = ['tenant_admin', 'platform_admin', 'author'];
const TABS: readonly { id: Tab; label: MessageKey }[] = [
  { id: 'course', label: 'tab.course' },
  { id: 'phases', label: 'tab.phases' },
  { id: 'quests', label: 'tab.quests' },
];

/** A aba e a fase de um caminho do validador. */
function placeOf(path: string): { tab: Tab; phase?: number } {
  const q = /^\/phases\/(\d+)\/quests/.exec(path);
  if (q) return { tab: 'quests', phase: Number(q[1]) };
  if (path.startsWith('/phases')) return { tab: 'phases' };
  return { tab: 'course' };
}

export function App({ builder: injected }: { builder?: Builder } = {}) {
  const own = useBuilder();
  const b = injected ?? own;
  const { t, language, setLanguage } = useI18n();
  const ids = { role: useId(), language: useId(), nav: useId() };
  const [dark, setDark] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [focusPath, setFocusPath] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);
  // O aviso sai sozinho depois de alguns segundos (ele é falado na hora pelo role="status").
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  // Depois de trocar de aba, o foco vai ao campo do problema (ou ao item que o contém).
  useEffect(() => {
    if (!focusPath) return;
    let path = focusPath;
    while (path) {
      const el = document.querySelector<HTMLElement>(`[data-path="${path}"]`);
      if (el) {
        if (el.matches('input, select')) el.focus();
        else (el.querySelector<HTMLElement>('input, select, button') ?? el).focus();
        break;
      }
      path = path.slice(0, path.lastIndexOf('/'));
    }
    setFocusPath(null);
  }, [focusPath, b.tab, b.phase]);

  const goTo = (path: string) => {
    const place = placeOf(path);
    b.setTab(place.tab);
    if (place.phase !== undefined) b.setPhase(place.phase);
    setFocusPath(path);
  };
  const problemPaths = new Set(b.problems.map((p) => p.path));
  const bad = (path: string) => problemPaths.has(path);
  const editable = b.doc !== null && !b.studentView;

  return (
    <div className="admin" data-nav-open={navOpen || undefined}>
      <a className="skip" href="#conteudo">
        {t('app.skip')}
      </a>
      <aside className="sidebar" id={ids.nav}>
        <div className="brand" aria-hidden="true">
          PMLife <span>{t('app.brand')}</span>
        </div>
        <nav aria-label={t('nav.label')}>
          <ul>
            <li>
              <button
                type="button"
                className="nav-item"
                aria-current="page"
                onClick={() => {
                  b.open(null);
                  setNavOpen(false);
                }}
              >
                {t('nav.courses')}
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main-col">
        <header className="topbar">
          <button type="button" className="icon-button menu" aria-expanded={navOpen} aria-controls={ids.nav} aria-label={t(navOpen ? 'nav.close' : 'nav.open')} onClick={() => setNavOpen((o) => !o)}>
            ☰
          </button>
          <div className="controls">
            <label className="control" htmlFor={ids.role}>
              {t('top.role')}
              <select id={ids.role} value={b.role} onChange={(e) => b.setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`top.roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="control" htmlFor={ids.language}>
              {t('top.language')}
              <select id={ids.language} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="pt-BR">Português</option>
                <option value="en-US">English</option>
              </select>
            </label>
            <button type="button" className="button theme" aria-pressed={dark} onClick={() => setDark((d) => !d)}>
              {t('top.theme')}
            </button>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1}>
          {b.doc === null ? (
            <CoursesPage b={b} onNew={() => setCreating(true)} />
          ) : (
            <EditorPage b={b} bad={bad} editable={editable} goTo={goTo} notify={setNotice} />
          )}
        </main>
      </div>
      {creating && (
        <NewCourseDialog
          b={b}
          onCancel={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setNotice(t('new.created', { name }));
          }}
        />
      )}
      <p className="toast" role="status" data-testid="notice" hidden={!notice}>
        {notice}
      </p>
    </div>
  );
}

function CoursesPage({ b, onNew }: { b: Builder; onNew: () => void }) {
  const { t, language } = useI18n();
  const masters = b.role !== 'author';
  return (
    <>
      <h1>{t('courses.title', { name: DEMO_INSTITUTION.name })}</h1>
      {masters ? (
        <div className="page-actions">
          <button type="button" className="button primary" onClick={onNew}>
            {t('courses.new')}
          </button>
        </div>
      ) : (
        <p className="note">{t('courses.onlyMasters')}</p>
      )}
      {b.courses.length === 0 ? (
        <p className="empty card">{t('courses.empty')}</p>
      ) : (
        <ul className="course-list" data-testid="courses">
          {b.courses.map((d) => {
            const c = d.draft ?? d.versions[d.versions.length - 1];
            const status = d.versions.length === 0 ? t('courses.draft') : d.draft ? t('courses.versionDraft', { version: d.versions.length }) : t('courses.version', { version: d.versions.length });
            return (
              <li key={d.slug} className="card course-row">
                <div>
                  <strong>{say(c.title, language)}</strong>
                  <span className="hint block">
                    <code>{c.courseId}</code> · {status}
                  </span>
                </div>
                <button type="button" className="button" onClick={() => b.open(d.slug)} aria-label={`${t('courses.open')}: ${say(c.title, language)}`}>
                  {t('courses.open')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function NewCourseDialog({ b, onCancel, onCreated }: { b: Builder; onCancel: () => void; onCreated: (name: string) => void }) {
  const { t, language } = useI18n();
  const ids = { slug: useId(), pt: useId(), en: useId(), hint: useId() };
  const [slug, setSlug] = useState('');
  const [title, setTitleState] = useState({ pt: '', en: '' });
  const [errors, setErrors] = useState<Partial<Record<'slug' | 'title', NewCourseError>>>({});
  const [forbidden, setForbidden] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = b.create({ slug, title });
    if (r.kind === 'created') return onCreated(language === 'pt-BR' ? title.pt.trim() : title.en.trim());
    if (r.kind === 'forbidden') return setForbidden(true);
    setErrors(r.errors);
    document.getElementById(r.errors.slug ? ids.slug : ids.pt)?.focus();
  };

  return (
    <Dialog title={t('new.title')} onClose={onCancel}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={ids.slug}>{t('new.slug')}</label>
          <input id={ids.slug} value={slug} autoComplete="off" data-autofocus aria-invalid={errors.slug ? true : undefined} aria-describedby={`${ids.hint}${errors.slug ? ` ${ids.slug}-error` : ''}`} onChange={(e) => setSlug(e.target.value)} />
          <span id={ids.hint} className="hint">
            {t('new.slugHint', { tenant: DEMO_INSTITUTION.slug })}
          </span>
          {errors.slug && (
            <span id={`${ids.slug}-error`} className="field-error">
              {t(`new.errors.${errors.slug}`)}
            </span>
          )}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor={ids.pt}>{t('new.titlePt')}</label>
            <input id={ids.pt} value={title.pt} aria-invalid={errors.title ? true : undefined} onChange={(e) => setTitleState((x) => ({ ...x, pt: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor={ids.en}>{t('new.titleEn')}</label>
            <input id={ids.en} value={title.en} aria-invalid={errors.title ? true : undefined} onChange={(e) => setTitleState((x) => ({ ...x, en: e.target.value }))} />
          </div>
        </div>
        {errors.title && <p className="field-error">{t(`new.errors.${errors.title}`)}</p>}
        {forbidden && (
          <p className="form-alert" role="alert">
            {t('new.errors.FORBIDDEN')}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            {t('new.cancel')}
          </button>
          <button type="submit" className="button primary">
            {t('new.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EditorPage({ b, bad, editable, goTo, notify }: { b: Builder; bad: (p: string) => boolean; editable: boolean; goTo: (path: string) => void; notify: (m: string) => void }) {
  const { t, language } = useI18n();
  const ids = { tabs: useId(), problems: useId() };
  const doc = b.doc!;
  const version = doc.versions.length;
  const status = b.studentView
    ? t('editor.status.student', { version })
    : version === 0
      ? t('editor.status.draftOnly')
      : doc.draft
        ? t('editor.status.draft', { version })
        : t('editor.status.published', { version });
  const course = b.course;
  const title = course ? say(course.title, language) : doc.slug;

  const publish = () => {
    const r = b.publishDraft();
    if (r.ok) notify(t('editor.published', { version: r.version }));
    else {
      notify(t('editor.refused', { count: r.problems.length }));
      document.getElementById(ids.problems)?.focus();
    }
  };

  return (
    <>
      <div className="toolbar">
        <button type="button" className="link" onClick={() => b.open(null)}>
          ← {t('editor.back')}
        </button>
        <div className="toolbar-actions">
          <button type="button" className="button" aria-pressed={b.studentView} disabled={version === 0} onClick={() => b.setStudentView(!b.studentView)}>
            {t('editor.studentView')}
          </button>
          {!b.studentView && (
            <button type="button" className="button primary" onClick={publish}>
              {t('editor.publish')}
            </button>
          )}
        </div>
      </div>
      <h1>{title}</h1>
      <p className="status" data-testid="status">
        {status}
      </p>
      {b.studentView ? (
        course && <StudentView b={b} />
      ) : (
        course && (
          <div className="workspace">
            <div>
              <div role="tablist" aria-label={t('editor.tabs')} className="tabs" id={ids.tabs}>
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`${ids.tabs}-${tab.id}`}
                    aria-selected={b.tab === tab.id}
                    aria-controls={`${ids.tabs}-panel`}
                    tabIndex={b.tab === tab.id ? 0 : -1}
                    className="tab"
                    onClick={() => b.setTab(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                      const i = TABS.findIndex((x) => x.id === b.tab);
                      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                      b.setTab(next.id);
                      document.getElementById(`${ids.tabs}-${next.id}`)?.focus();
                    }}
                  >
                    {t(tab.label)}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`${ids.tabs}-panel`} aria-labelledby={`${ids.tabs}-${b.tab}`} className="panel">
                {b.tab === 'course' && <CoursePanel course={course} edit={b.edit} bad={bad} disabled={!editable} />}
                {b.tab === 'phases' && <PhasesPanel course={course} edit={b.edit} bad={bad} disabled={!editable} />}
                {b.tab === 'quests' && <QuestsPanel course={course} edit={b.edit} bad={bad} disabled={!editable} phase={b.phase} setPhase={b.setPhase} />}
              </div>
            </div>
            <aside className="side">
              <section className="problems" aria-labelledby={ids.problems} data-testid="problems">
                <h2 id={ids.problems} tabIndex={-1}>
                  {t('problems.heading')}
                </h2>
                {b.problems.length === 0 ? (
                  <p className="ok-text">{t('problems.none')}</p>
                ) : (
                  <ul>
                    {b.problems.map((p, i) => (
                      <li key={`${p.code}${p.path}${i}`}>
                        <button type="button" className="link" onClick={() => goTo(p.path)}>
                          {problemPlace(p.path, t)}: {t(`problem.${p.code}` as MessageKey)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )
      )}
    </>
  );
}

function StudentView({ b }: { b: Builder }) {
  const { t, language } = useI18n();
  const course = b.course!;
  const order = phaseOrder(course);
  const byId = new Map(course.phases.map((p) => [p.id, p]));
  return (
    <section className="card" aria-labelledby="student-heading" data-testid="student">
      <h2 id="student-heading">{t('student.heading')}</h2>
      <ol className="student-phases">
        {order.map((id) => {
          const p = byId.get(id)!;
          const after = p.requires.map((r) => byId.get(r)).filter((x) => x !== undefined);
          return (
            <li key={id}>
              <strong>{say(p.title, language)}</strong>{' '}
              <span className="hint">({after.length === 0 ? t('student.free') : t('student.after', { list: after.map((x) => say(x.title, language)).join(', ') })})</span>
              <ul>
                {p.quests.map((q) => (
                  <li key={q.id}>{t('student.quest', { title: say(q.title, language), building: say(p.buildings.find((x) => x.id === q.buildingId)?.label ?? { pt: '?', en: '?' }, language), xp: q.xp })}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
