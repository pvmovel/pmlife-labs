// O editor da sala (o que o master da instituição faz no editor do mundo, US75): cada objeto "Na parede" ou "No chão",
// a parede e a posição, ou o centro e a frente; "Acrescentar quadro" numa parede; e "Publicar". As mudanças ficam num
// rascunho: a sala só muda se o domínio não achar problema, e a recusa diz o problema e o objeto (nada é gravado).
import { useState } from 'react';
import { applyRoom, freeOffset, movePlacement, NEW_ROOM, placementOf, replaceItem, WALL_ITEMS_PER_WALL, WALLS, type Room, type RoomItem, type RoomProblem, type Wall } from '../../Domain/Room';
import { useI18n } from '../i18n/I18n';

type Status = { kind: 'ok'; text: string } | { kind: 'refused'; problems: RoomProblem[] } | null;

export function RoomEditor({ room, onPublish }: { room: Room; onPublish: (room: Room) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Room>(room);
  const [status, setStatus] = useState<Status>(null);
  const [addWall, setAddWall] = useState<Wall>('north');
  const [base, setBase] = useState(room);
  if (base !== room) {
    // A sala publicada mudou (publicar, acrescentar, sala nova): o rascunho recomeça dela.
    setBase(room);
    setDraft(room);
  }

  const nameOf = (id: string, inRoom: Room = draft) => {
    const it = inRoom.items.find((i) => i.id === id);
    if (it) return `“${t(it.textKey)}”`;
    const st = inRoom.stations.find((s) => s.id === id);
    return st ? t(st.labelKey) : id;
  };
  const change = (item: RoomItem) => setDraft((d) => replaceItem(d, item));
  const number = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const publish = (next: Room, okText: string) => {
    const r = applyRoom(next);
    if (r.ok) {
      onPublish(r.room);
      setStatus({ kind: 'ok', text: okText });
    } else setStatus({ kind: 'refused', problems: r.problems });
  };
  const addBoard = () => {
    const n = room.items.filter((i) => i.id.startsWith('quadro-novo-')).length + 1;
    const board: RoomItem = { id: `quadro-novo-${n}`, kind: 'board', textKey: 'items.novo', width: 2.4, wall: addWall, offset: freeOffset(room, addWall, 2.4) };
    publish({ ...room, items: [...room.items, board] }, t('editor.added', { wall: t(`editor.walls.${addWall}`) }));
  };
  const counts = WALLS.map((w) => `${t(`editor.walls.${w}`)} ${draft.items.filter((i) => placementOf(i) === 'wall' && (i.wall ?? 'north') === w).length}`).join(' · ');

  return (
    <section className="card editor" aria-labelledby="editor-title" data-testid="editor">
      <h2 id="editor-title">{t('editor.title')}</h2>
      <p className="muted" data-testid="wall-counts">
        {t('editor.counts', { counts, max: WALL_ITEMS_PER_WALL })}
      </p>
      <div className="editor-items">
        {draft.items.map((it) => {
          const floor = placementOf(it) === 'floor';
          return (
            <fieldset key={it.id} className="editor-item" data-item={it.id}>
              <legend>
                {t(`editor.kinds.${it.kind}`)}: {t(it.textKey)}
              </legend>
              <div className="group" role="radiogroup" aria-label={t('editor.placement')}>
                {(['wall', 'floor'] as const).map((p) => (
                  <label key={p} className="toggle">
                    <input type="radio" name={`place-${it.id}`} data-testid={`place-${it.id}-${p}`} checked={placementOf(it) === p} onChange={() => change(movePlacement(it, p))} />
                    {t(`editor.${p}`)}
                  </label>
                ))}
              </div>
              {floor ? (
                <div className="fields">
                  <label>
                    {t('editor.x')} <input type="number" step="0.1" data-testid={`x-${it.id}`} value={Number.isFinite(it.x) ? it.x : ''} onChange={(e) => change({ ...it, x: number(e.target.value) })} />
                  </label>
                  <label>
                    {t('editor.z')} <input type="number" step="0.1" data-testid={`z-${it.id}`} value={Number.isFinite(it.z) ? it.z : ''} onChange={(e) => change({ ...it, z: number(e.target.value) })} />
                  </label>
                  <label>
                    {t('editor.facing')}{' '}
                    <select data-testid={`facing-${it.id}`} value={it.facing} onChange={(e) => change({ ...it, facing: e.target.value as Wall })}>
                      {WALLS.map((w) => (
                        <option key={w} value={w}>
                          {t(`editor.walls.${w}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="fields">
                  <label>
                    {t('editor.whichWall')}{' '}
                    <select data-testid={`wall-${it.id}`} value={it.wall} onChange={(e) => change({ ...it, wall: e.target.value as Wall })}>
                      {WALLS.map((w) => (
                        <option key={w} value={w}>
                          {t(`editor.walls.${w}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('editor.offset')} <input type="number" step="0.1" data-testid={`offset-${it.id}`} value={Number.isFinite(it.offset) ? it.offset : ''} onChange={(e) => change({ ...it, offset: number(e.target.value) })} />
                  </label>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="group">
        <button type="button" className="primary" data-testid="publish" onClick={() => publish(draft, t('editor.published'))}>
          {t('editor.publish')}
        </button>
        <button type="button" onClick={() => (setDraft(room), setStatus(null))}>
          {t('editor.discard')}
        </button>
      </div>
      <h3>{t('editor.addTitle')}</h3>
      <div className="group">
        <label>
          {t('editor.addWall')}{' '}
          <select data-testid="add-wall" value={addWall} onChange={(e) => setAddWall(e.target.value as Wall)}>
            {WALLS.map((w) => (
              <option key={w} value={w}>
                {t(`editor.walls.${w}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-testid="add-board" onClick={addBoard}>
          {t('editor.add')}
        </button>
        <button
          type="button"
          data-testid="new-room"
          onClick={() => {
            onPublish({ ...NEW_ROOM, stations: [], items: [] });
            setStatus({ kind: 'ok', text: t('editor.newRoomDone', { size: NEW_ROOM.halfSize * 2 }) });
          }}
        >
          {t('editor.newRoom')}
        </button>
      </div>
      <div aria-live="polite" data-testid="editor-status">
        {status?.kind === 'ok' && <p className="said-ok">{status.text}</p>}
        {status?.kind === 'refused' && (
          <div role="alert" className="said-refused">
            <p>{t('editor.refused')}</p>
            <ul data-testid="editor-problems">
              {status.problems.map((p, k) => (
                <li key={k} data-code={p.code} data-item={p.itemId}>
                  {t(`editor.problems.${p.code}`, { item: nameOf(p.itemId, draft.items.some((i) => i.id === p.itemId) ? draft : { ...room, items: [...room.items, { id: p.itemId, kind: 'board', textKey: 'items.novo', width: 0 }] }), wall: p.wall ? t(`editor.walls.${p.wall}`) : '', target: p.target ? nameOf(p.target) : '' })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
