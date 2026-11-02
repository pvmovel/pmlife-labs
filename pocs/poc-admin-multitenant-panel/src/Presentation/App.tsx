// A casca do admin: navegação lateral (gaveta no celular), cabeçalho com "Ver como" (só na demo), instituição em foco
// (só o master da plataforma escolhe), idioma e tema, e um aviso falado (aria-live) depois de cada ação.
import { useEffect, useId, useState } from 'react';
import { visibleSections, type Section } from '../Domain/AdminAccess';
import { DEMO_ACTORS } from '../Content/fakeData';
import { useI18n, type Language } from './i18n';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { AuditPage, CoursesPage, EnrollmentsPage, MembersPage } from './pages/TenantPages';
import { useAdminStore } from './useAdminStore';

export function App({ initialActor = 'platform' }: { initialActor?: string }) {
  const { t, language, setLanguage } = useI18n();
  const ids = { viewAs: useId(), tenant: useId(), language: useId(), nav: useId() };
  const [actorId, setActorId] = useState(initialActor);
  const demo = DEMO_ACTORS.find((a) => a.id === actorId) ?? DEMO_ACTORS[0];
  const actor = demo.actor;
  const store = useAdminStore(actor, demo.name);
  const sections = visibleSections(actor);
  const [section, setSection] = useState<Section>(sections[0] ?? 'members');
  const [focusTenant, setFocusTenant] = useState('aurora');
  const [dark, setDark] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Trocar de papel volta para a primeira seção que ele vê.
  useEffect(() => {
    const first = visibleSections(actor)[0];
    if (first) setSection((s) => (visibleSections(actor).includes(s) ? s : first));
  }, [actor]);
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

  const tenant = actor.role === 'platform_master' ? focusTenant : (actor.tenant ?? '');
  const tenantName = store.institutions.find((i) => i.slug === tenant)?.name ?? tenant;
  const go = (s: Section) => {
    setSection(s);
    setNavOpen(false);
    setToast('');
  };
  const pageProps = { actor, tenant, tenantName, store, notify: setToast };

  return (
    <div className="admin" data-nav-open={navOpen || undefined}>
      <a className="skip" href="#conteudo">
        {t('app.skip')}
      </a>
      {sections.length > 0 && (
      <aside className="sidebar">
        <div className="brand" aria-hidden="true">
          PMLife <span>Admin</span>
        </div>
        <nav id={ids.nav} aria-label={t('nav.label')}>
          <ul>
            {sections.map((s) => (
              <li key={s}>
                <button type="button" className="nav-item" aria-current={s === section ? 'page' : undefined} onClick={() => go(s)}>
                  {t(`section.${s}`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      )}
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="main-col">
        <header className="topbar">
          {sections.length > 0 && (
            <button type="button" className="icon-button menu" aria-expanded={navOpen} aria-controls={ids.nav} aria-label={t(navOpen ? 'nav.close' : 'nav.open')} onClick={() => setNavOpen((o) => !o)}>
              ☰
            </button>
          )}
          <div className="controls">
            <div className="control">
              <label htmlFor={ids.viewAs}>{t('top.viewAs')}</label>
              <select id={ids.viewAs} value={actorId} onChange={(e) => setActorId(e.target.value)}>
                {DEMO_ACTORS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t('actor.label', { name: a.name, role: t(`role.${a.actor.role}`) })}
                  </option>
                ))}
              </select>
            </div>
            {actor.role === 'platform_master' && section !== 'institutions' && (
              <div className="control">
                <label htmlFor={ids.tenant}>{t('top.tenant')}</label>
                <select id={ids.tenant} value={focusTenant} onChange={(e) => setFocusTenant(e.target.value)}>
                  {store.institutions.map((i) => (
                    <option key={i.slug} value={i.slug}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
          {sections.length === 0 ? (
            <section className="denied" role="alert">
              <h1>{t('denied.title')}</h1>
              <p>{t('denied.body')}</p>
            </section>
          ) : (
            <>
              <h1>{t(`section.${section}`)}</h1>
              <p className="sr-only" role="status" aria-live="polite" data-testid="notice">
                {toast}
              </p>
              {toast && (
                <div className="toast" aria-hidden="true">
                  {toast}
                </div>
              )}
              {section === 'institutions' && <InstitutionsPage store={store} notify={setToast} />}
              {section === 'members' && <MembersPage {...pageProps} />}
              {section === 'enrollments' && <EnrollmentsPage {...pageProps} />}
              {section === 'courses' && <CoursesPage {...pageProps} />}
              {section === 'audit' && <AuditPage {...pageProps} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
