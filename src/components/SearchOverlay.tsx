import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Card, SearchFilter, SearchResults, SearchSuggest, Track } from '../../shared/types';
import { useLibrary } from '../store/library';
import { api } from '../api';
import { formatTime } from '../lib/format';
import { cardMenu, openMenuAt, trackMenu } from '../lib/trackMenu';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { cardPath } from './Cards';
import { Cover } from './Cover';
import { IClose, IDisc, IGrid, IList, IMore, IMusic, ISearch, IUser } from './icons';
import { SOURCE_NAME, parseLink } from '../lib/links';
import { BrandIcon } from './BrandIcon';

const TABS: [SearchFilter, string, ReactNode][] = [
  ['all', 'Все', <IGrid size={15} key="a" />],
  ['songs', 'Треки', <IMusic size={15} key="s" />],
  ['artists', 'Исполнители', <IUser size={15} key="r" />],
  ['albums', 'Альбомы', <IDisc size={15} key="l" />],
  ['playlists', 'Плейлисты', <IList size={15} key="p" />]
];

type Row = { kind: 'track'; track: Track; list: Track[]; index: number } | { kind: 'card'; card: Card };

function rowsOf(r: SearchResults, f: SearchFilter): Row[] {
  const tracks: Row[] = r.tracks.map((t, i) => ({ kind: 'track', track: t, list: r.tracks, index: i }));
  const cards = (c: Card[]): Row[] => c.map((card) => ({ kind: 'card', card }));
  if (f === 'songs') return tracks;
  if (f === 'artists') return cards(r.artists);
  if (f === 'albums') return cards(r.albums);
  if (f === 'playlists') return cards(r.playlists);
  const top: Row[] = r.top && r.top.kind !== 'track' ? cards([r.top]) : [];
  return [...top, ...tracks.slice(0, 6), ...cards(r.artists.filter((a) => a.id !== r.top?.id).slice(0, 2)), ...cards(r.albums.slice(0, 3)), ...cards(r.playlists.slice(0, 2))];
}

const rowKey = (r: Row) => (r.kind === 'track' ? `t:${r.track.id}` : `${r.card.kind}:${r.card.id}`);
function dedupe(rows: Row[]): Row[] {
  // Порядок — по первому появлению, но если у повтора есть обложка, а у первого нет — берём обложку
  const byKey = new Map<string, Row>();
  for (const r of rows) {
    const k = rowKey(r);
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, r);
    else if (prev.kind === 'card' && r.kind === 'card' && !prev.card.thumb && r.card.thumb) byKey.set(k, { kind: 'card', card: { ...prev.card, thumb: r.card.thumb } });
  }
  return [...byKey.values()];
}

/** Слова начинаются с введённого: «ми» найдёт «Miyagi», «Мияги», «Do It For Me». */
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
function startsAnyWord(text: string, q: string): boolean {
  const t = fold(text);
  const n = fold(q).trim();
  if (!n) return false;
  return t.startsWith(n) || t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(n)) || (n.length >= 3 && t.includes(n));
}

/** Мгновенно — из своей библиотеки и истории, без ожидания сети. */
function localRows(q: string): Row[] {
  const lib = useLibrary.getState();
  const tracks = new Map<string, Track>();
  for (const t of [...lib.history.map((h) => h.track), ...lib.likes.map((l) => l.track)]) {
    if (tracks.size >= 3) break;
    if (!tracks.has(t.id) && (startsAnyWord(t.title, q) || t.artists.some((a) => startsAnyWord(a.name, q)))) tracks.set(t.id, t);
  }
  const artists = new Map<string, Card>();
  for (const t of lib.history.map((h) => h.track)) {
    if (artists.size >= 2) break;
    for (const a of t.artists) if (a.id && !artists.has(a.id) && startsAnyWord(a.name, q)) artists.set(a.id, { kind: 'artist', id: a.id, title: a.name, subtitle: 'Исполнитель' });
  }
  const saved = lib.saved.map((x) => x.card).filter((c) => startsAnyWord(c.title, q)).slice(0, 2);
  return [...[...artists.values()].map((card) => ({ kind: 'card' as const, card })), ...[...tracks.values()].map((t) => ({ kind: 'track' as const, track: t, list: [t], index: 0 })), ...saved.map((card) => ({ kind: 'card' as const, card }))];
}

const searchCache = new Map<string, SearchResults>();
const suggestCache = new Map<string, SearchSuggest>();

const KIND_LABEL: Record<string, string> = { artist: 'Исполнитель', album: 'Альбом', playlist: 'Плейлист', track: 'Трек' };

/** Поиск поверх любого экрана: поле разворачивается из кнопки в шапке, фон размывается. */
export function SearchOverlay() {
  const open = useUi((s) => s.search);
  const setSearch = useUi((s) => s.setSearch);
  const navigate = useNavigate();
  const playTracks = usePlayer((s) => s.playTracks);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(-1);
  const [sug, setSug] = useState<SearchSuggest | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    const f = () => input.current?.focus();
    window.addEventListener('focus-search-overlay', f);
    return () => window.removeEventListener('focus-search-overlay', f);
  }, []);

  const link = useMemo(() => parseLink(q), [q]);
  const isLink = !!link;
  // Состояние загрузки меняем в обработчиках, а не в эффекте: setState в эффекте после
  // каждого нажатия клавиши копит «вложенные» обновления React, и на ~50-м символе он падает.
  const changeQuery = (v: string) => {
    setQ(v);
    const searchable = !!v.trim() && !parseLink(v);
    setSel(-1);
    if (!searchable) {
      setRes(null);
      setSug(null);
      setLoading(false);
      return;
    }
    // Уже искали — показываем сразу, без ожидания
    const hit = searchCache.get(`${filter}:${v.trim().toLowerCase()}`);
    if (hit) setRes(hit);
    const sHit = suggestCache.get(v.trim().toLowerCase());
    if (sHit) setSug(sHit);
    setLoading(!hit);
  };
  const changeFilter = (f: SearchFilter) => {
    setFilter(f);
    if (q.trim() && !isLink) setLoading(true);
  };
  // Подсказки — почти мгновенно, с первой буквы
  useEffect(() => {
    const text = q.trim();
    const key = text.toLowerCase();
    if (!text || isLink || suggestCache.has(key)) return;
    let alive = true;
    const t = setTimeout(() => {
      api
        .suggestRich(text)
        .then((r) => {
          suggestCache.set(key, r);
          if (alive) setSug(r);
        })
        .catch(() => {});
    }, 70);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, isLink]);
  // Полный поиск — чуть позже, когда пользователь замедлился
  useEffect(() => {
    const text = q.trim();
    const key = `${filter}:${text.toLowerCase()}`;
    if (!text || isLink) return;
    if (searchCache.has(key)) return setLoading(false);
    let alive = true;
    const t = setTimeout(() => {
      api
        .search(text, filter)
        .then((r) => {
          searchCache.set(key, r);
          if (searchCache.size > 120) searchCache.delete(searchCache.keys().next().value as string);
          if (alive) setRes(r);
        })
        .catch(() => alive && setRes(null))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, filter, isLink]);

  const close = () => setSearch(false);
  const openLink = async () => {
    if (!link) return;
    if (link.type === 'import') return useUi.getState().openImport(link.url);
    close();
    if (link.type === 'playlist') return navigate(`/playlist/${link.id}`);
    if (link.type === 'album') return navigate(`/album/${link.id}`);
    if (link.type === 'artist') return navigate(`/artist/${link.id}`);
    try {
      const list = await api.upNext(link.id);
      const i = Math.max(0, list.findIndex((t) => t.id === link.id));
      if (list.length) playTracks(list, i, { label: 'По ссылке' });
      else useUi.getState().toast('Трек по ссылке не найден', 'error');
    } catch {
      useUi.getState().toast('Не удалось открыть ссылку', 'error');
    }
  };
  const linkText = !link ? '' : link.type === 'import' ? `Импортировать из ${SOURCE_NAME[link.source]}` : link.type === 'track' ? 'Включить трек по ссылке' : link.type === 'playlist' ? 'Открыть плейлист по ссылке' : link.type === 'album' ? 'Открыть альбом по ссылке' : 'Открыть исполнителя по ссылке';
  const local = useMemo(() => (q.trim() && !isLink ? localRows(q) : []), [q, isLink]);
  // Подсказки показываем, только если они для текущего текста (или его начала)
  const sugFresh = sug && q.trim().toLowerCase().startsWith(sug.query.toLowerCase()) ? sug : null;
  const quick: Row[] =
    filter === 'all'
      ? [...local, ...(sugFresh?.items ?? []).map((c): Row => (c.kind === 'track' && c.track ? { kind: 'track', track: c.track, list: [c.track], index: 0 } : { kind: 'card', card: c }))]
      : [];
  const rows = dedupe([...quick, ...(res ? rowsOf(res, filter) : [])]);
  const chips = (sugFresh?.queries ?? []).filter((x) => x.toLowerCase() !== q.trim().toLowerCase()).slice(0, 5);
  const activate = (r: Row) => {
    if (r.kind === 'track' && r.list.length === 1) usePlayer.getState().playTrack(r.track, { label: `Волна по «${r.track.title}»` });
    else if (r.kind === 'track') playTracks(r.list, r.index, { label: `Поиск: ${q}` });
    // Фокус остаётся в поле — можно сразу искать дальше
    if (r.kind === 'track') setTimeout(() => input.current?.focus(), 0);
    else {
      close();
      navigate(cardPath(r.card));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="sov-col">
            <motion.label layoutId="search-pill" className="sov-input" transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
              <ISearch size={19} />
              <span className="sr">Поиск</span>
              <input
                ref={input}
                value={q}
                onChange={(e) => changeQuery(e.target.value)}
                placeholder="Поиск или ссылка (YouTube, Spotify, SoundCloud)"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                  if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(rows.length - 1, s + 1)));
                  if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(-1, s - 1)));
                  if (e.key === 'Enter' && link) return void openLink();
                  if (e.key === 'Enter') {
                    if (sel >= 0 && rows[sel]) activate(rows[sel]);
                    else if (q.trim()) {
                      close();
                      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
                    }
                  }
                }}
              />
              {q && <button type="button" className="ic ic-36" aria-label="Очистить" onClick={() => (changeQuery(''), input.current?.focus())}><IClose size={15} /></button>}
            </motion.label>

            <AnimatePresence>
              {q.trim() && (
                <motion.div className="sov-panel" initial={{ opacity: 0, y: -8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
                  {link && (
                    <div className="sov-link" role="button" tabIndex={0} onClick={() => void openLink()} onKeyDown={(e) => e.key === 'Enter' && void openLink()}>
                      <BrandIcon brand={link.type === 'import' ? link.source : 'ytmusic'} size={44} radius={12} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b>{linkText}</b><span className="muted small ell" style={{ maxWidth: 640 }}>{q.trim()}</span></span>
                    </div>
                  )}
                  {!link && <>
                  <div className="sov-tabs" role="tablist" aria-label="Тип результатов">
                    {TABS.map(([f, l, icon]) => (
                      <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => changeFilter(f)}>
                        {icon}{l}
                        {filter === f && <motion.span layoutId="sov-tab" className="sov-tab-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      </button>
                    ))}
                  </div>
                  {filter === 'all' && chips.length > 0 && (
                    <div className="sov-chips" aria-label="Подсказки">
                      {chips.map((c) => (
                        <button key={c} type="button" onClick={() => (changeQuery(c), input.current?.focus())}>
                          <ISearch size={13} />
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="sov-list" role="listbox" aria-label="Результаты" aria-busy={loading}>
                    {loading && rows.length === 0 && Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="sov-row" aria-hidden="true"><span className="skel" style={{ width: 52, height: 52 }} /><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><span className="skel" style={{ height: 13, width: '35%' }} /><span className="skel" style={{ height: 11, width: '20%' }} /></span></div>
                    ))}
                    {res && !loading && rows.length === 0 && <div className="empty" style={{ padding: 40 }}><b>Ничего не нашлось</b><span>Попробуй написать по-другому.</span></div>}
                    {rows.map((r, i) => {
                      const menu = (e: MouseEvent) => openMenuAt(e, r.kind === 'track' ? trackMenu(r.track, navigate) : cardMenu(r.card, navigate));
                      const title = r.kind === 'track' ? r.track.title : r.card.title;
                      const sub = r.kind === 'track' ? r.track.artists.map((a) => a.name).join(', ') : [KIND_LABEL[r.card.kind], r.card.subtitle].filter((x, k) => x && (k === 0 || x !== KIND_LABEL[r.card.kind])).join(' · ');
                      return (
                        <motion.div
                          key={rowKey(r)}
                          role="option"
                          aria-selected={sel === i}
                          className={`sov-row ${sel === i ? 'on' : ''}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i, 10) * 0.015, duration: 0.2 }}
                          onClick={() => activate(r)}
                          onContextMenu={menu}
                          onMouseEnter={() => setSel(i)}
                        >
                          <Cover src={r.kind === 'track' ? r.track.thumb : r.card.thumb} size={52} radius={10} round={r.kind === 'card' && r.card.kind === 'artist'} />
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                            <span className="ell" style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
                            <span className="ell muted" style={{ fontSize: 14 }}>{sub}</span>
                          </span>
                          {r.kind === 'track' && r.track.durationSec ? <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(r.track.durationSec)}</span> : null}
                          <button type="button" className="ic ic-36" aria-label="Действия" onClick={(e) => (e.stopPropagation(), menu(e))}><IMore size={18} /></button>
                        </motion.div>
                      );
                    })}
                  </div>
                  </>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
