// O editor do mundo no admin: a lista de documentos da instituição (a sede, a cidade do curso e as fases; o curso da
// plataforma só para ver e copiar), a planta (a cidade ou o interior de um prédio), o painel do item, os problemas do
// validador na hora (cada um leva ao item), o rascunho e a publicação, a visão do aluno (a versão publicada) e a
// pré-visualização 3D sob demanda. "Instituição (demonstração)" troca de instituição para mostrar o isolamento.
import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { ensureInterior, moveBuilding, moveSpawn, moveStation, moveWallItem, removeBuilding, removeStation, removeWallItem, updateStation, updateWallItem, type Selection } from '../Domain/editing';
import type { Problem } from '../Domain/validateWorld';
import type { World } from '../Domain/World';
import { Dialog } from './components/Dialog';
import { Inspector } from './components/Inspector';
import { PlanView } from './components/PlanView';
import { useI18n, type Language } from './i18n';
import type { MessageKey } from '../Content/Locales/pt-BR';
import { useEditor, type Editor } from './useEditor';

const Preview3D = lazy(() => import('./Preview3D'));

/** O nome do item de um problema, para a lista. */
function itemName(world: World, path: string, t: (k: MessageKey, v?: Record<string, string | number>) => string, lang: 'pt' | 'en'): string {
  if (path === '/') return t('problems.city');
  if (path === '/spawn') return t('inspector.spawn');
  const b = /^\/buildings\/(\d+)$/.exec(path);
  if (b) return world.buildings[Number(b[1])]?.label[lang] ?? path;
  const m = /^\/interiors\/(\d+)(?:\/(stations|wallItems)\/(\d+))?$/.exec(path);
  if (!m) return path;
  const room = world.interiors[Number(m[1])];
  const name = world.buildings.find((x) => x.id === room?.buildingId)?.label[lang] ?? '';
  if (!m[2]) return t('problems.room', { name });
  return m[2] === 'stations' ? t('problems.station', { n: Number(m[3]) + 1, name }) : t('problems.wallItem', { name });
}

export function App({ editor: injected }: { editor?: Editor } = {}) {
  const own = useEditor();
  const ed = injected ?? own;
  const { t, language, setLanguage } = useI18n();
  const lang = language === 'pt-BR' ? 'pt' : 'en';
  const ids = { inst: useId(), language: useId(), nav: useId(), problems: useId() };
  const [dark, setDark] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  // No celular, a gaveta aberta cobre o botão do menu: Esc também fecha.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const { world, view, doc } = ed;
  const problemPaths = new Set(ed.problems.map((p) => p.path));
  const room = view.kind === 'interior' ? world.buildings.find((b) => b.id === view.buildingId) : undefined;

  const dragTo = (sel: Selection, x: number, z: number) =>
    ed.edit((w) => {
      if (sel.type === 'spawn') return moveSpawn(w, x, z);
      if (sel.type === 'building') {
        const b = w.buildings.find((bb) => bb.id === sel.id);
        return b ? moveBuilding(w, sel.id, x - b.x, z - b.z) : w;
      }
      if (sel.type === 'station') return updateStation(w, sel.buildingId, sel.id, { x, z });
      const item = w.interiors.find((i) => i.buildingId === sel.buildingId)?.wallItems.find((i) => i.id === sel.id);
      return item ? updateWallItem(w, sel.buildingId, sel.id, { offset: item.wall === 'north' || item.wall === 'south' ? x : z }) : w;
    });
  const nudge = (sel: Selection, dx: number, dz: number) =>
    ed.edit((w) => {
      if (sel.type === 'spawn') return moveSpawn(w, w.spawn.x + dx, w.spawn.z + dz);
      if (sel.type === 'building') return moveBuilding(w, sel.id, dx, dz);
      if (sel.type === 'station') return moveStation(w, sel.buildingId, sel.id, dx, dz);
      return moveWallItem(w, sel.buildingId, sel.id, dx);
    });
  const remove = (sel: Selection) => {
    if (sel.type === 'spawn') return;
    if (sel.type === 'building') {
      const next = removeBuilding(world, sel.id);
      if (!next) return setNotice(t('notice.requiredStays'));
      ed.edit(() => next);
    } else if (sel.type === 'station') ed.edit((w) => removeStation(w, sel.buildingId, sel.id));
    else ed.edit((w) => removeWallItem(w, sel.buildingId, sel.id));
    ed.select(null);
  };

  const publishNow = () => {
    const r = ed.publishDraft();
    if (r.ok) setNotice(t('notice.published', { version: r.version }));
    else {
      setNotice(t('notice.notPublished', { count: r.problems.length }));
      document.getElementById(ids.problems)?.focus();
    }
  };

  const problemText = (p: Problem) => `${itemName(ed.doc.draft ?? world, p.path, t, lang)}: ${t(`problem.${p.code}`, { param: p.param ?? '' })}`;

  return (
    <div className="admin" data-nav-open={navOpen || undefined}>
      <a className="skip" href="#conteudo">
        {t('app.skip')}
      </a>
      <aside className="sidebar">
        <div className="brand" aria-hidden="true">
          PMLife <span>{t('app.brand')}</span>
        </div>
        <nav id={ids.nav} aria-label={t('nav.label')}>
          <ul>
            {ed.institution.documents.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="nav-item"
                  aria-current={d.id === doc.id ? 'page' : undefined}
                  onClick={() => {
                    ed.openDocument(d.id);
                    setNavOpen(false);
                    setNotice('');
                  }}
                >
                  {d.title[lang]}
                  <span className="nav-tag">{d.source === 'platform' ? t('nav.platform') : d.draft ? t('nav.draft') : t('nav.version', { version: d.versions.length })}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="main-col">
        <header className="topbar">
          <button type="button" className="icon-button menu" aria-expanded={navOpen} aria-controls={ids.nav} aria-label={t(navOpen ? 'nav.close' : 'nav.open')} onClick={() => setNavOpen((o) => !o)}>
            ☰
          </button>
          <div className="controls">
            <div className="control">
              <label htmlFor={ids.inst}>{t('top.institution')}</label>
              <select id={ids.inst} value={ed.institution.slug} onChange={(e) => ed.setInstitution(e.target.value)}>
                {ed.institutions.map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="control">
              <label htmlFor={ids.language}>{t('top.language')}</label>
              <select id={ids.language} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="pt-BR">Português</option>
                <option value="en-US">English</option>
              </select>
            </div>
            <button type="button" className="button theme" aria-pressed={dark} onClick={() => setDark((d) => !d)}>
              {t('top.theme')}
            </button>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1}>
          <h1>{doc.title[lang]}</h1>
          <p className="status" data-testid="doc-status">
            {doc.source === 'platform'
              ? t('status.platform', { version: ed.version })
              : ed.hasDraft
                ? t('status.draft', { version: ed.version })
                : t('status.published', { version: ed.version })}
          </p>
          {doc.source === 'platform' && (
            <div className="note">
              <p>{t('platform.body')}</p>
              <button type="button" className="button primary" onClick={() => ed.copy({ pt: t('platform.copyTitlePt', { name: doc.title.pt }), en: t('platform.copyTitleEn', { name: doc.title.en }) })}>
                {t('platform.copy')}
              </button>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite" data-testid="notice">
            {notice}
          </p>
          {notice && (
            <div className="toast" aria-hidden="true">
              {notice}
            </div>
          )}
          <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
            <nav className="crumbs" aria-label={t('toolbar.where')}>
              <button type="button" className="link" aria-current={view.kind === 'city' ? 'location' : undefined} onClick={() => ed.setView({ kind: 'city' })}>
                {t('toolbar.city')}
              </button>
              {room && (
                <>
                  <span aria-hidden="true"> › </span>
                  <span aria-current="location">{t('toolbar.interior', { name: room.label[lang] })}</span>
                </>
              )}
            </nav>
            <div className="toolbar-actions">
              {doc.source === 'tenant' && (
                <button type="button" className="button" aria-pressed={ed.studentView} onClick={() => ed.setStudentView(!ed.studentView)}>
                  {t('toolbar.studentView')}
                </button>
              )}
              <button type="button" className="button" onClick={() => setPreview(true)}>
                {t('toolbar.preview')}
              </button>
              {ed.editable && ed.hasDraft && (
                <button
                  type="button"
                  className="button danger-ghost"
                  onClick={() => {
                    ed.discard();
                    setNotice(t('notice.discarded'));
                  }}
                >
                  {t('toolbar.discard')}
                </button>
              )}
              {ed.editable && (
                <button type="button" className="button primary" disabled={!ed.hasDraft} onClick={publishNow}>
                  {t('toolbar.publish')}
                </button>
              )}
            </div>
          </div>
          {ed.studentView && <p className="note">{t('status.studentView', { version: ed.version })}</p>}
          <div className="workspace">
            <div className="plan-card">
              <PlanView
                world={world}
                view={view}
                selection={ed.selection}
                problemPaths={problemPaths}
                editable={ed.editable}
                onSelect={ed.select}
                onDragTo={dragTo}
                onNudge={nudge}
                onDelete={remove}
                onOpenInterior={(id) => {
                  if (!world.interiors.some((i) => i.buildingId === id) && !ed.editable) return;
                  if (ed.editable) ed.edit((w) => ensureInterior(w, id));
                  ed.setView({ kind: 'interior', buildingId: id });
                }}
              />
              <p className="hint">{t(ed.editable ? 'plan.help' : 'plan.helpReadOnly')}</p>
            </div>
            <div className="side">
              <Inspector world={world} view={view} selection={ed.selection} editable={ed.editable} edit={ed.edit} select={ed.select} setView={ed.setView} notify={setNotice} />
              {!ed.studentView && doc.source === 'tenant' && (
                <section className="problems" aria-labelledby={ids.problems}>
                  <h2 id={ids.problems} tabIndex={-1}>
                    {t('problems.title', { count: ed.problems.length })}
                  </h2>
                  {ed.problems.length === 0 ? (
                    <p className="ok-text">{t('problems.none')}</p>
                  ) : (
                    <ul>
                      {ed.problems.map((p, i) => (
                        <li key={`${p.code}-${p.path}-${i}`}>
                          <button type="button" className="link" onClick={() => ed.focusProblem(p)}>
                            {problemText(p)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
      {preview && (
        <Dialog title={t('preview.title', { name: room ? room.label[lang] : doc.title[lang] })} onClose={() => setPreview(false)}>
          <div className="preview" data-testid="preview">
            <Suspense fallback={<p role="status">{t('preview.loading')}</p>}>
              <Preview3D world={world} view={view} />
            </Suspense>
          </div>
          <p className="hint">{t('preview.hint')}</p>
        </Dialog>
      )}
    </div>
  );
}
