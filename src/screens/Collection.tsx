import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { confirmSave, share, usePageArt } from '../lib/share';
import { getMix, mixSubtitle, mixTracks } from '../lib/mixes';
import { MixCover } from '../components/Mixes';
import type { Card, Collection as Col, Track } from '../../shared/types';
import { api, isDesktop } from '../api';
import { ErrorState, RowsSkeleton } from '../components/Cards';
import { Cover } from '../components/Cover';
import { promptPlaylistName } from '../components/PlaylistDialog';
import { IChevronLeft, IDownload, IHeartFill, IMoreH, IMusic, IPause, IPin, IPlay, IPlus, ISearch, IShuffle, ISort, ITrash, IEdit, IWave, ICheckCircle, ILibraryAdd, ILibraryDone, IShare } from '../components/icons';
import { TrackTable } from '../components/Tracks';
import { formatTotal, tracksWord } from '../lib/format';
import { addToPlaylistSubmenu, openMenuAt } from '../lib/trackMenu';
import { useQuery } from '../lib/useQuery';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi, type MenuItem } from '../store/ui';

type Kind = 'album' | 'playlist' | 'local' | 'liked' | 'downloads' | 'mix';
type Sort = 'default' | 'title' | 'artist' | 'duration';

interface View {
  year?: string;
  /** Исполнители со ссылками (для альбома) */
  artists?: { id?: string; name: string }[];
  title: string;
  label: string;
  description?: string;
  author?: string;
  meta?: string;
  thumb?: string;
  special?: 'liked' | 'downloads';
  tracks: Track[];
  addedAt?: number[];
}

export function CollectionScreen({ kind }: { kind: Kind }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const remote = kind === 'album' || kind === 'playlist';
  const { data, error, loading, reload } = useQuery<Col>(remote ? `${kind}:${id}` : null, () => (kind === 'album' ? api.album(id) : api.playlist(id)));
  const mix = kind === 'mix' ? getMix(Number(id)) : undefined;
  const mixQ = useQuery<Track[]>(mix ? `mix:${mix.seed.id}` : null, () => mixTracks(mix!));
  const lib = useLibrary();
  const toast = useUi((s) => s.toast);
  const playTracks = usePlayer((s) => s.playTracks);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const source = usePlayer((s) => s.source);
  const startRadio = usePlayer((s) => s.startRadio);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  usePageArt(remote ? data?.thumb : mix?.cover);

  const path = kind === 'liked' ? '/liked' : kind === 'downloads' ? '/downloads' : `/${kind}/${id}`;
  const local = kind === 'local' ? lib.playlists.find((p) => p.id === id) : undefined;

  const view: View | null = useMemo(() => {
    if (kind === 'liked') return { title: 'Любимое', label: 'Плейлист', special: 'liked', tracks: lib.likes.map((l) => l.track), addedAt: lib.likes.map((l) => l.addedAt) };
    if (kind === 'downloads') {
      const list = Object.values(lib.downloads).sort((a, b) => b.at - a.at);
      return { title: 'Скачанное', label: 'Доступно без интернета', special: 'downloads', tracks: list.map((d) => d.track), addedAt: list.map((d) => d.at) };
    }
    if (kind === 'mix') return mix ? { title: mix.title, label: 'Микс', author: mixSubtitle(mix, mixQ.data), thumb: mix.cover, tracks: mixQ.data ?? [] } : null;
    if (kind === 'local') return local ? { title: local.name, label: 'Плейлист', description: local.description, tracks: local.tracks.map((t) => t.track), addedAt: local.tracks.map((t) => t.addedAt), thumb: local.tracks[0]?.track.thumb } : null;
    if (!data) return null;
    const artists = kind === 'album' ? data.tracks[0]?.artists.filter((a) => !data.author || data.author.includes(a.name)) : undefined;
    return { title: data.title, label: kind === 'album' ? 'Альбом' : 'Плейлист', description: data.description, author: data.author, meta: data.subtitle, thumb: data.thumb, tracks: data.tracks, year: data.year ?? data.subtitle?.match(/\b(19|20)\d{2}\b/)?.[0], artists: artists?.length ? artists : undefined };
  }, [kind, lib.likes, lib.downloads, local, data, mix, mixQ.data]);

  const tracks = useMemo(() => {
    if (!view) return [];
    let list = view.tracks.map((t, i) => ({ t, i }));
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(({ t }) => t.title.toLowerCase().includes(s) || t.artists.some((a) => a.name.toLowerCase().includes(s)) || t.album?.name.toLowerCase().includes(s));
    }
    if (sort === 'title') list.sort((a, b) => a.t.title.localeCompare(b.t.title, 'ru'));
    if (sort === 'artist') list.sort((a, b) => (a.t.artists[0]?.name ?? '').localeCompare(b.t.artists[0]?.name ?? '', 'ru'));
    if (sort === 'duration') list.sort((a, b) => (a.t.durationSec ?? 0) - (b.t.durationSec ?? 0));
    return list;
  }, [view, q, sort]);

  if (kind === 'mix' && mixQ.loading && !mixQ.data) return <div className="page"><div className="skel" style={{ height: 220, borderRadius: 22, maxWidth: 640 }} /><RowsSkeleton count={8} /></div>;
  if (remote && loading && !data) return <div className="page"><div className="skel" style={{ height: 220, borderRadius: 22, maxWidth: 640 }} /><RowsSkeleton count={8} /></div>;
  if (remote && error && !data) return <ErrorState text={error} onRetry={reload} />;
  if (!view) return <div className="empty"><b>Плейлист не найден</b><button type="button" className="btn" onClick={() => navigate('/library')}>В библиотеку</button></div>;

  const total = view.tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0);
  const isThisPlaying = source?.path === path;
  const src = { label: view.title, path };
  const card: Card | null = remote ? { kind: kind as 'album' | 'playlist', id, title: view.title, subtitle: view.author ?? view.meta, thumb: view.thumb } : null;
  const saved = card ? lib.isSaved(id) : false;
  const allDownloaded = view.tracks.length > 0 && view.tracks.every((t) => lib.downloads[t.id]);

  const downloadAll = async () => {
    const todo = view.tracks.filter((t) => !lib.downloads[t.id]);
    toast(`Скачиваем ${tracksWord(todo.length)}…`);
    let ok = 0;
    for (const t of todo) {
      try {
        await useLibrary.getState().download(t);
        ok++;
      } catch {
        /* продолжаем со следующего */
      }
    }
    toast(ok === todo.length ? 'Всё скачано' : `Скачано ${ok} из ${todo.length}`, ok === todo.length ? 'info' : 'error');
  };

  const moreItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      ...(isDesktop && kind !== 'downloads' && !allDownloaded && view.tracks.length ? [{ label: 'Скачать всё', icon: <IDownload size={17} />, onClick: () => void downloadAll() }] : []),
      ...(view.tracks[0] ? [{ label: 'Волна по подборке', icon: <IWave size={17} />, onClick: () => void startRadio(view.tracks[Math.floor(Math.random() * view.tracks.length)]) }] : []),
      { label: 'Добавить в очередь', onClick: () => (usePlayer.getState().addToQueue(view.tracks), toast('Добавлено в очередь')) },
      { label: 'Добавить в плейлист', submenu: addToPlaylistSubmenu(view.tracks) }
    ];
    if (local) {
      items.push(
        { divider: true },
        { label: 'Переименовать', icon: <IEdit size={17} />, onClick: async () => { const n = await promptPlaylistName('Переименовать плейлист', local.name); if (n) lib.renamePlaylist(local.id, n, local.description); } },
        { label: local.pinned ? 'Открепить' : 'Закрепить', icon: <IPin size={17} />, onClick: () => lib.togglePin(local.id) },
        { label: 'Удалить плейлист', icon: <ITrash size={17} />, danger: true, onClick: () => { lib.deletePlaylist(local.id); navigate('/library'); toast('Плейлист удалён'); } }
      );
    }
    if (kind === 'playlist') items.push({ label: 'Сохранить как свой плейлист', onClick: () => { const p = lib.createPlaylist(view.title, view.tracks); navigate(`/local/${p.id}`); } });
    return items;
  };

  return (
    <div className="page" style={{ gap: 24 }}>
      <header className="hero">
        {view.special ? (
          <span className="cv" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: view.special === 'liked' ? 'radial-gradient(90% 90% at 20% 10%, var(--tint) 0%, transparent 70%), linear-gradient(160deg, #2A2150, #0F0D1C)' : 'linear-gradient(160deg, #1F8A70, #0B2E26)' }}>
            {view.special === 'liked' ? <IHeartFill size={84} /> : <IDownload size={76} />}
          </span>
        ) : mix ? (
          <span className="cv" style={{ display: 'flex' }}><MixCover mix={mix} size={232} /></span>
        ) : (
          <Cover className="cv" src={view.thumb} size={232} radius={18} eager />
        )}
        <div style={{ flex: '1 1 420px', minHeight: 232, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <h1 className="ell" style={{ marginTop: 8 }}>{view.title}</h1>
          <span className="muted ell coll-artists">
            {view.artists
              ? view.artists.map((a, i) => <span key={a.name}>{i > 0 && ', '}{a.id ? <Link to={`/artist/${a.id}`}>{a.name}</Link> : a.name}</span>)
              : view.author ?? view.label}
          </span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {kind === 'album' && view.year && <span className="meta-pill">{view.year}</span>}
            <span className="meta-pill">
              <IMusic size={15} />
              {tracksWord(view.tracks.length)}
              {total > 0 && <><span className="dot" />{formatTotal(total)}</>}
            </span>
          </span>
          {view.description && <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 640, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{view.description}</p>}
          <span style={{ flex: 1 }} />
          <div className="actions">
            <div className="l" style={{ gap: 8 }}>
              <button type="button" className="btn light" style={{ height: 44, padding: '0 22px 0 18px' }} disabled={!view.tracks.length} onClick={() => (isThisPlaying ? toggle() : playTracks(view.tracks, 0, src))}>
                {isThisPlaying && playing ? <IPause size={17} /> : <IPlay size={17} />}
                {isThisPlaying && playing ? 'Пауза' : 'Слушать все'}
              </button>
              <button type="button" className="btn sq" style={{ height: 44 }} aria-label="Перемешать и слушать" disabled={!view.tracks.length} onClick={() => { if (!usePlayer.getState().shuffle) usePlayer.getState().toggleShuffle(); playTracks(view.tracks, Math.floor(Math.random() * view.tracks.length), src); }}><IShuffle size={18} /></button>
              {card && (
                <button type="button" className={`btn sq ${saved ? 'on' : ''}`} style={{ height: 44 }} aria-label={saved ? 'Убрать из библиотеки' : 'Добавить в библиотеку'} title={saved ? 'В библиотеке' : 'Добавить в библиотеку'} aria-pressed={saved} onClick={() => void confirmSave(card, saved, lib.toggleSaved)}>
                  {saved ? <ILibraryDone size={18} /> : <ILibraryAdd size={18} />}
                </button>
              )}
              {card && <button type="button" className="btn sq" style={{ height: 44 }} aria-label="Поделиться" title="Скопировать ссылку" onClick={() => void share(card.kind, id, view.title)}><IShare size={18} /></button>}
            </div>
            <div className="r" style={{ gap: 8 }}>
              <label className="field" style={{ width: 230, height: 44 }}>
                <ISearch size={16} />
                <span className="sr">Поиск в плейлисте</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'album' ? 'Поиск в альбоме' : 'Поиск в плейлисте'} />
              </label>
              <button type="button" className="btn" style={{ height: 44 }} disabled={!view.tracks.length} onClick={() => (usePlayer.getState().addToQueue(view.tracks), toast('Добавлено в очередь'))}><IPlus size={17} />Добавить в очередь</button>
              <button type="button" className="btn sq" style={{ height: 44, background: sort !== 'default' ? 'rgba(255,255,255,.16)' : undefined }} aria-label="Сортировка" title="Сортировка" onClick={(e) => openMenuAt(e, ([['default', view.addedAt ? 'По дате добавления' : 'По порядку'], ['title', 'По названию'], ['artist', 'По исполнителю'], ['duration', 'По длительности']] as [Sort, string][]).map(([v, l]) => ({ label: l, icon: sort === v ? <ICheckCircle size={16} /> : undefined, onClick: () => setSort(v) })))}>
                <ISort size={18} />
              </button>
              <button type="button" className="btn sq" style={{ height: 44 }} aria-label="Ещё" onClick={(e) => openMenuAt(e, moreItems())}><IMoreH size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      {view.tracks.length === 0 ? (
        <div className="empty">
          <b>{kind === 'liked' ? 'Нажимай ♥ у треков — они появятся здесь' : kind === 'downloads' ? 'Скачанных треков пока нет' : 'В плейлисте пока пусто'}</b>
          <button type="button" className="btn" onClick={() => navigate('/search')}>Найти музыку</button>
        </div>
      ) : (
        <div className="tracks-panel">
        <TrackTable
          tracks={tracks.map((x) => x.t)}
          addedAt={view.addedAt ? tracks.map((x) => view.addedAt![x.i]) : undefined}
          source={src}
          playlistId={local?.id}
          showAlbum={kind !== 'album'}
          showCover={kind !== 'album'}
        />
        </div>
      )}
    </div>
  );
}

export function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" className="ic ic-40 filled no-drag" aria-label="Назад" onClick={() => navigate(-1)}>
      <IChevronLeft size={18} />
    </button>
  );
}
