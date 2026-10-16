import { useEffect, useState } from 'react';
import { useI18n } from './i18n/I18nProvider';
import { LANGUAGES } from './i18n/messages';

const LABELS = { 'pt-BR': 'PT', 'en-US': 'EN' } as const;

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [htmlLang, setHtmlLang] = useState(document.documentElement.lang);

  // Só para a demo: observa o atributo real de <html lang>, que o I18nProvider atualiza.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setHtmlLang(root.lang));
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] });
    setHtmlLang(root.lang);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">{t('common.backToLabs')}</a>
        <a className="btn" href="../../../catalogo/spike-i18n-type-safe-react/">{t('common.documentation')}</a>
      </nav>

      <div className="top">
        <p className="eyebrow">{t('demo.eyebrow')}</p>
        <div className="group" role="group" aria-label={t('common.language')}>
          {LANGUAGES.map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={l === language} onClick={() => setLanguage(l)}>
              {LABELS[l]}
            </button>
          ))}
        </div>
      </div>
      <h1>{t('demo.title')}</h1>
      <p className="lead">{t('demo.lead')}</p>

      <section className="card">
        <h2>{t('demo.liveTitle')}</h2>
        <dl className="pairs">
          <dt><code>common.appName</code></dt>
          <dd data-testid="app-name">{t('common.appName')}</dd>
          <dt><code>common.greeting</code></dt>
          <dd>{t('common.greeting', { name: 'Ana', count: 3 })}</dd>
          <dt><code>footer.engine</code></dt>
          <dd>{t('footer.engine')}</dd>
          <dt><code>footer.status.online</code></dt>
          <dd>{t('footer.status.online')}</dd>
          <dt><code>footer.release.title</code></dt>
          <dd>{t('footer.release.title')}</dd>
          <dt>{t('demo.htmlLang')}</dt>
          <dd><code data-testid="html-lang">{`<html lang="${htmlLang}">`}</code></dd>
        </dl>
      </section>

      <section className="card">
        <h2>{t('demo.compileTitle')}</h2>
        <p className="muted">{t('demo.compileLead')}</p>
        <pre className="code">{`t('footer.relase.title')
//  ~~~~~~~~~~~~~~~~~~~~~~
// Argument of type '"footer.relase.title"' is not assignable
// to parameter of type 'TranslationKey'.`}</pre>
      </section>

      <section className="card">
        <h2>{t('demo.parityTitle')}</h2>
        <p className="muted">{t('demo.parityLead')}</p>
      </section>
    </main>
  );
}
