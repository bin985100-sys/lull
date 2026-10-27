import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchFilter } from '../../shared/types';
import { api } from '../api';
import { ErrorState, GridSkeleton, MediaCard, RowsSkeleton, Section, cardPath, playCard } from '../components/Cards';
import { Cover } from '../components/Cover';
import { IClock, IClose, IPlay, ISearch } from '../components/icons';
import { TrackRow } from '../components/Tracks';
import { useQuery } from '../lib/useQuery';
import { useLibrary } from '../store/library';

const FILTERS: [SearchFilter, string][] = [
  ['all', 'Всё'],
  ['songs', 'Треки'],
  ['artists', 'Исполнители'],
  ['albums', 'Альбомы'],
  ['playlists', 'Плейлисты']
];

let recentCache: string[] | null = null;
async function getRecent(): Promise<string[]> {
  if (!recentCache) recentCache = (await api.storeGet<string[]>('recentSearches')) ?? [];
  return recentCache;
}
function pushRecent(q: string) {
  void getRecent().then((r) => {
    recentCache = [q, ...r.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12);
    void api.storeSet('recentSearches', recentCache);
  });
}

/** Поле поиска в верхней панели — рендерится в слот topbar через портал. */
export function SearchBox({ slot }: { slot: HTMLElement | null }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [sugs, setSugs] = useState<string[]>([]);
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    input.current?.focus();
    const onFocusSearch = () => input.current?.focus();
    window.addEventListener('focus-search', onFocusSearch);
    return () => window.removeEventListener('focus-search', onFocusSearch);
  }, []);
  useEffect(() => {
    if (!text.trim() || text === q) return;
    const t = setTimeout(() => void api.suggest(text).then(setSugs).catch(() => setSugs([])), 180);
    return () => clearTimeout(t);
  }, [text, q]);

  const submit = (value: string) => {
    const v = value.trim();
    setSugs([]);
    setSel(-1);
    if (!v) return;
    pushRecent(v);
    const next = new URLSearchParams(params);
    next.set('q', v);
    setParams(next);
    input.current?.blur();
  };

  if (!slot) return null;
  return createPortal(
    <div className="no-drag" style={{ position: 'relative', flex: '0 1 640px', margin: '0 auto' }}>
      <label className="field" style={{ height: 48, borderRadius: 16, background: 'rgba(255,255,255,.09)', boxShadow: focus ? '0 0 0 4px rgba(255,255,255,.05), 0 16px 40px rgba(0,0,0,.35)' : undefined }}>
        <ISearch size={18} />
        <span className="sr">Поиск</span>
        <input
          ref={input}
          value={text}
          placeholder="Трек, исполнитель, альбом"
          onChange={(e) => (setText(e.target.value), setSel(-1), !e.target.value.trim() && setSugs([]))}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(sel >= 0 ? sugs[sel] : text);
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(sugs.length - 1, s + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(-1, s - 1)));
            if (e.key === 'Escape') (setSugs([]), input.current?.blur());
          }}
          style={{ fontSize: 16, fontWeight: 600 }}
        />
        {text && (
          <button type="button" className="ic ic-36" aria-label="Очистить" onClick={() => (setText(''), input.current?.focus())}><IClose size={15} /></button>
        )}
      </label>
      {focus && sugs.length > 0 && (
        <div className="suggest" role="listbox" aria-label="Подсказки">
          {sugs.map((s, i) => (
            <button key={s} type="button" role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), setText(s), submit(s))}>
              <ISearch size={15} />{s}
            </button>
          ))}
        </div>
      )}
    </div>,
    slot
  );
}

export function Search() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const filter = (params.get('f') as SearchFilter) || 'all';
  const { data, error, loading, reload } = useQuery(q ? `search:${filter}:${q}` : null, () => api.search(q, filter));
  const [recent, setRecent] = useState<string[]>([]);
  const history = useLibrary((s) => s.history);
  useEffect(() => void getRecent().then(setRecent), [q]);

  const setFilter = (f: SearchFilter) => {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('f');
    else next.set('f', f);
    setParams(next);
  };

  if (!q) {
    const recentTracks = history.slice(0, 8).map((h) => h.track);
    return (
      <div className="page">
        {recent.length > 0 && (
          <Section title="Недавние запросы" action={<button type="button" className="btn sm" onClick={() => (recentCache = [], void api.storeSet('recentSearches', []), setRecent([]))}>Очистить</button>}>
            <div className="chips">
              {recent.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => setParams({ q: r })} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <IClock size={14} />{r}
                </button>
              ))}
            </div>
          </Section>
        )}
        {recentTracks.length > 0 ? (
          <Section title="Недавно играло">
            <div className="tracks-box tracks-2col">{recentTracks.map((t, i) => <TrackRow key={t.id} list={recentTracks} index={i} />)}</div>
          </Section>
        ) : (
          recent.length === 0 && <div className="empty"><b>Что послушаем?</b><span>Ищи по названию трека, исполнителю или альбому.</span></div>
        )}
      </div>
    );
  }

  return (
    <div className="page" style={{ gap: 28 }}>
      <div className="chips" role="tablist" aria-label="Тип результатов">
        {FILTERS.map(([f, l]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{l}</button>
        ))}
      </div>

      {loading && !data && (filter === 'songs' ? <RowsSkeleton count={10} /> : <><RowsSkeleton count={4} /><GridSkeleton /></>)}
      {error && !data && <ErrorState text={error} onRetry={reload} />}
      {data && (
        <>
          {filter === 'all' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {data.top && (
                <section className="section" style={{ flex: '1 1 360px', gap: 12 }}>
                  <h2 className="h2" style={{ fontSize: 20 }}>Лучший результат</h2>
                  <div
                    className="card"
                    role="link"
                    tabIndex={0}
                    onClick={() => (data.top!.kind === 'track' ? void playCard(data.top!) : navigate(cardPath(data.top!)))}
                    style={{ position: 'relative', flex: 1, minHeight: 240, justifyContent: 'flex-end', gap: 16, padding: 22, borderRadius: 22, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}
                  >
                    <span style={{ position: 'absolute', top: 22, left: 22 }}>
                      <Cover src={data.top.thumb} size={104} round={data.top.kind === 'artist'} radius={14} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="ell" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.05 }}>{data.top.title}</span>
                      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,.1)', fontSize: 12, fontWeight: 700 }}>
                          {{ artist: 'Исполнитель', album: 'Альбом', playlist: 'Плейлист', track: 'Трек' }[data.top.kind]}
                        </span>
                        {data.top.subtitle && !['Исполнитель', 'Альбом', 'Плейлист'].includes(data.top.subtitle) && <span className="muted ell">{data.top.subtitle}</span>}
                      </span>
                    </span>
                    <button type="button" className="play-btn fab" style={{ right: 22, bottom: 22, width: 52, height: 52 }} aria-label="Слушать" onClick={(e) => (e.stopPropagation(), void playCard(data.top!))}><IPlay size={20} /></button>
                  </div>
                </section>
              )}
              {data.tracks.length > 0 && (
                <section className="section" style={{ flex: '1.5 1 440px', gap: 12 }}>
                  <h2 className="h2" style={{ fontSize: 20 }}>Треки</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {data.tracks.slice(0, 4).map((t, i) => <TrackRow key={t.id} list={data.tracks} index={i} source={{ label: `Поиск: ${q}` }} />)}
                  </div>
                </section>
              )}
            </div>
          )}
          {filter === 'songs' && (
            <div className="tracks-box" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.tracks.map((t, i) => <TrackRow key={t.id} list={data.tracks} index={i} source={{ label: `Поиск: ${q}` }} />)}
            </div>
          )}
          {(filter === 'all' || filter === 'artists') && data.artists.length > 0 && (
            <Section title="Исполнители"><div className="grid">{data.artists.slice(0, filter === 'all' ? 6 : 30).map((c) => <MediaCard key={c.id} card={c} />)}</div></Section>
          )}
          {(filter === 'all' || filter === 'albums') && data.albums.length > 0 && (
            <Section title="Альбомы"><div className="grid">{data.albums.slice(0, filter === 'all' ? 6 : 30).map((c) => <MediaCard key={c.id} card={c} />)}</div></Section>
          )}
          {(filter === 'all' || filter === 'playlists') && data.playlists.length > 0 && (
            <Section title="Плейлисты"><div className="grid">{data.playlists.slice(0, filter === 'all' ? 6 : 30).map((c) => <MediaCard key={c.id} card={c} />)}</div></Section>
          )}
          {!data.top && !data.tracks.length && !data.albums.length && !data.artists.length && !data.playlists.length && (
            <div className="empty"><b>Ничего не нашлось</b><span>Попробуй написать по-другому.</span></div>
          )}
        </>
      )}
    </div>
  );
}
