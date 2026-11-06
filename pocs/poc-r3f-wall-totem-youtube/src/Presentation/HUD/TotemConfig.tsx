// O que o master da instituição faz no editor do mundo (US37) para um totem: cola o link do YouTube, escolhe a parede
// e a posição e publica. O link vira o ID na hora (o domínio extrai; o resto do link é descartado); o link que não é
// de um vídeo do YouTube é recusado sem gravar nada, e o totem sobre a porta também (a mesma regra da publicação).
import { useId, useState } from 'react';
import { WALLS, configureTotem, type Room, type Wall } from '../../Domain/Room';
import { extractVideoId } from '../../Domain/YouTube';
import { useI18n } from '../i18n/I18n';

export function TotemConfig({ room, onPublish }: { room: Room; onPublish: (room: Room) => void }) {
  const { t } = useI18n();
  const ids = { totem: useId(), link: useId(), hint: useId(), wall: useId(), offset: useId() };
  const [totemId, setTotemId] = useState(room.totems[0]?.id ?? '');
  const totem = room.totems.find((x) => x.id === totemId) ?? room.totems[0];
  const [link, setLink] = useState(`https://youtu.be/${totem?.videoId ?? ''}`);
  const [wall, setWall] = useState<Wall>(totem?.wall ?? 'north');
  const [offset, setOffset] = useState(String(totem?.offset ?? 0));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const videoId = extractVideoId(link);

  const pick = (id: string) => {
    const next = room.totems.find((x) => x.id === id);
    if (!next) return;
    setTotemId(id);
    setLink(`https://youtu.be/${next.videoId}`);
    setWall(next.wall);
    setOffset(String(next.offset));
    setResult(null);
  };

  const publish = () => {
    const r = configureTotem(room, totemId, { videoId, wall, offset: Number(offset) || 0 });
    if (r.ok) {
      onPublish(r.room);
      setResult({ ok: true, text: t('config.published', { id: videoId ?? '' }) });
    } else {
      const problems = r.problems.map((p) => t(`config.problems.${p.code}`, { totem: t(room.totems.find((x) => x.id === p.totemId)?.titleKey ?? p.totemId) })).join('; ');
      setResult({ ok: false, text: t('config.refused', { problems }) });
    }
  };

  return (
    <section className="card config" aria-labelledby={`${ids.totem}-title`}>
      <h2 id={`${ids.totem}-title`}>{t('config.title')}</h2>
      <div className="config-grid">
        <label htmlFor={ids.totem}>{t('config.totem')}</label>
        <select id={ids.totem} value={totemId} onChange={(e) => pick(e.target.value)}>
          {room.totems.map((x) => (
            <option key={x.id} value={x.id}>
              {t(x.titleKey)}
            </option>
          ))}
        </select>
        <label htmlFor={ids.link}>{t('config.link')}</label>
        <div>
          <input id={ids.link} value={link} inputMode="url" autoComplete="off" aria-describedby={ids.hint} aria-invalid={videoId === null || undefined} onChange={(e) => setLink(e.target.value)} />
          <p id={ids.hint} className="muted small">
            {videoId ? t('config.videoId', { id: videoId }) : t('config.noId')} {t('config.linkHint')}
          </p>
        </div>
        <label htmlFor={ids.wall}>{t('config.wall')}</label>
        <select id={ids.wall} value={wall} onChange={(e) => setWall(e.target.value as Wall)}>
          {WALLS.map((w) => (
            <option key={w} value={w}>
              {t(`config.walls.${w}`)}
            </option>
          ))}
        </select>
        <label htmlFor={ids.offset}>{t('config.offset')}</label>
        <input id={ids.offset} type="number" step={0.5} value={offset} onChange={(e) => setOffset(e.target.value)} />
      </div>
      <button type="button" className="publish" onClick={publish}>
        {t('config.publish')}
      </button>
      <p className={result?.ok === false ? 'config-result error-text' : 'config-result'} role="status" data-testid="config-result">
        {result?.text ?? ''}
      </p>
    </section>
  );
}
