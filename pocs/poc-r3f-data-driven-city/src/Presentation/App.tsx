import { lazy, Suspense, useEffect, useState } from 'react';
import type { TrackSummary } from '../Application/Ports/CurriculumRepository';
import type { CityDefinition } from '../Domain/City';
import { useCurriculum } from './di/DependenciesProvider';
import { useI18n, type Language } from './i18n/I18n';

const CityCanvas3D = lazy(() => import('./Engine3D/CityCanvas3D'));

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'PT' },
  { id: 'en-US', label: 'EN' },
];

export function App() {
  const curriculum = useCurriculum();
  const { language, setLanguage, t } = useI18n();
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [city, setCity] = useState<CityDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    curriculum.listTracks().then((list) => {
      setTracks(list);
      setTrackId((current) => current ?? list[0]?.trackId ?? null);
    });
  }, [curriculum]);

  useEffect(() => {
    if (!trackId) return;
    setError(null);
    curriculum
      .getCity(trackId)
      .then(setCity)
      .catch((e: Error) => setError(e.message));
  }, [curriculum, trackId]);

  const loader = (
    <div className="loader" role="status" data-testid="loader">
      {t('page.loading')}
    </div>
  );

  return (
    <main className="page">
      <nav className="labs-nav" aria-label="PMLife Labs">
        <a className="btn" href="../../../">{t('nav.back')}</a>
        <a className="btn" href="../../../catalogo/poc-r3f-data-driven-city/">{t('nav.docs')}</a>
      </nav>

      <p className="eyebrow">{t('page.eyebrow')}</p>
      <h1>{t('page.title')}</h1>
      <p className="lead">{t('page.lead')}</p>

      <div className="controls">
        <div className="group" role="group" aria-label={t('page.track')}>
          {tracks.map((tr) => (
            <button key={tr.trackId} type="button" aria-pressed={tr.trackId === trackId} onClick={() => setTrackId(tr.trackId)}>
              {t(tr.labelKey)}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label={t('page.language')}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" lang={l.id} aria-pressed={l.id === language} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <section className="scene">
        {error ? (
          <p role="alert" className="error">{t('page.error', { message: error })}</p>
        ) : city ? (
          <Suspense fallback={loader}>
            <CityCanvas3D
              city={city}
              labelOf={(key) => t(key)}
              ariaLabel={t('page.sceneLabel', { track: t(city.labelKey), count: city.buildings.length })}
            />
          </Suspense>
        ) : (
          loader
        )}
      </section>

      {city && (
        <section className="card">
          <h2>{t('page.dataTitle')}</h2>
          <p className="muted"><code>{t('page.dataHint', { track: city.trackId })}</code></p>
          <pre className="code" data-testid="city-json">{JSON.stringify(city, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
