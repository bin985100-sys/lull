import { useEffect, useState } from 'react';
import { api, isDesktop } from '../api';
import { CardRow } from '../components/Cards';
import { useNavigate } from 'react-router-dom';
import type { Card } from '../../shared/types';
import { MediaCard } from '../components/Cards';
import { Cover } from '../components/Cover';
import { promptPlaylistName } from '../components/PlaylistDialog';
import { ICheckCircle, IDownload, IGrid, IHeartFill, ILink, IList, IPin, IPlus, ISearch } from '../components/icons';
import { useUi } from '../store/ui';
import { relativeDate, tracksWord } from '../lib/format';
import { useLibrary } from '../store/library';
import { accountsEnabled } from '../account/client';

type Tab = 'all' | 'playlists' | 'albums' | 'artists' | 'downloads';

interface Item {
  key: string;
  type: Tab;
  name: string;
  meta: string;
  thumb?: string;
  round?: boolean;
  special?: 'liked' | 'downloads';
  pinned?: boolean;
  at: number;
  path: string;
  card?: Card;
}

export function Library() {
  const navigate = useNavigate();
  const { likes, playlists, saved, downloads, createPlaylist } = useLibrary();
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [q, setQ] = useState('');

  const dlCount = Object.keys(downloads).length;
  const items: Item[] = ([
    { key: 'liked', type: 'playlists', name: 'Любимое', meta: `Плейлист · ${tracksWord(likes.length)}`, special: 'liked', pinned: true, at: likes[0]?.addedAt ?? 0, path: '/liked' },
    { key: 'downloads', type: 'downloads', name: 'Скачанное', meta: dlCount ? tracksWord(dlCount) : 'Пока пусто', special: 'downloads', pinned: true, at: 0, path: '/downloads' },
    ...playlists.map((p): Item => ({ key: p.id, type: 'playlists', name: p.name, meta: `Плейлист · ${tracksWord(p.tracks.length)}`, thumb: p.tracks[0]?.track.thumb, pinned: p.pinned, at: p.createdAt, path: `/local/${p.id}` })),
    ...saved.map((s): Item => ({
      key: s.card.id,
      type: s.card.kind === 'album' ? 'albums' : s.card.kind === 'artist' ? 'artists' : 'playlists',
      name: s.card.title,
      meta: `${{ album: 'Альбом', artist: 'Исполнитель', playlist: 'Плейлист', track: 'Трек' }[s.card.kind]}${s.card.subtitle ? ` · ${s.card.subtitle}` : ''}`,
      thumb: s.card.thumb,
      round: s.card.kind === 'artist',
      at: s.at,
      path: s.card.kind === 'album' ? `/album/${s.card.id}` : s.card.kind === 'artist' ? `/artist/${s.card.id}` : `/playlist/${s.card.id}`,
      card: s.card
    }))
  ] as Item[]).filter((i) => isDesktop || i.special !== 'downloads');
  const shown = items
    .filter((i) => tab === 'all' || i.type === tab || (tab === 'playlists' && i.special === 'liked'))
    .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at);

  const create = async () => {
    const name = await promptPlaylistName('Новый плейлист');
    if (name) navigate(`/local/${createPlaylist(name).id}`);
  };

  const art = (i: Item, size: number | string) =>
    i.special ? (
      <span style={{ width: size, height: size, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: i.special === 'liked' ? 'radial-gradient(90% 90% at 20% 10%, var(--tint) 0%, transparent 70%), linear-gradient(160deg, #2A2150, #0F0D1C)' : 'linear-gradient(160deg, #1F8A70, #0B2E26)', flexShrink: 0 }}>
        {i.special === 'liked' ? <IHeartFill size={typeof size === 'number' ? size * 0.42 : 64} /> : <IDownload size={typeof size === 'number' ? size * 0.42 : 56} />}
      </span>
    ) : (
      <Cover src={i.thumb} size={size} round={i.round} radius={16} />
    );

  return (
    <div className="page library-page" style={{ gap: 22 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 className="h1">Библиотека</h1>
          <span className="muted">{shown.length} в разделе</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <label className="field" style={{ width: 240 }}>
            <ISearch size={16} />
            <span className="sr">Поиск по библиотеке</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по библиотеке" />
          </label>
          <div className="library-view" role="group" aria-label="Вид" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'rgba(255,255,255,.07)' }}>
            <button type="button" aria-label="Сеткой" aria-pressed={view === 'grid'} className={`ic ${view === 'grid' ? 'on' : ''}`} style={{ width: 38, height: 36, borderRadius: 9 }} onClick={() => setView('grid')}><IGrid size={16} /></button>
            <button type="button" aria-label="Списком" aria-pressed={view === 'list'} className={`ic ${view === 'list' ? 'on' : ''}`} style={{ width: 38, height: 36, borderRadius: 9 }} onClick={() => setView('list')}><IList size={16} /></button>
          </div>
          {isDesktop && <button type="button" className="btn" onClick={() => useUi.getState().openImport()}><ILink size={16} />Импорт по ссылке</button>}
          <button type="button" className="btn primary" onClick={() => void create()}><IPlus size={17} strokeWidth={2.4} />Создать плейлист</button>
        </div>
      </div>
      {tab === 'all' && isDesktop && !accountsEnabled && <YtLibrary />}
      <div className="chips" role="tablist" aria-label="Раздел">
        {([['all', 'Всё'], ['playlists', 'Плейлисты'], ['albums', 'Альбомы'], ['artists', 'Исполнители'], ...(isDesktop ? [['downloads', 'Скачанное']] : [])] as [Tab, string][]).map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {view === 'grid' ? (
        <div className="grid">
          {shown.map((i) =>
            i.card ? (
              <MediaCard key={i.key} card={i.card} />
            ) : (
              <div key={i.key} className="card" role="link" tabIndex={0} onClick={() => navigate(i.path)} onKeyDown={(e) => e.key === 'Enter' && navigate(i.path)} style={{ cursor: 'pointer' }}>
                <span className="cv" style={{ display: 'flex' }}>{art(i, '100%')}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 2px' }}>
                  <span className="t ell" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{i.pinned && <IPin size={13} style={{ color: 'var(--ok)', flexShrink: 0 }} aria-label="Закреплено" />}{i.name}</span>
                  <span className="s">{i.meta}</span>
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="tracks-box" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shown.map((i) => (
            <div key={i.key} className="trow" role="link" tabIndex={0} onClick={() => navigate(i.path)} style={{ cursor: 'pointer' }}>
              {art(i, 52)}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span className="tt ell">{i.name}</span>
                <span className="ta ell">{i.meta}</span>
              </span>
              <span className="muted small">{i.at ? relativeDate(i.at) : ''}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'downloads' && dlCount === 0 && (
        <div className="empty"><ICheckCircle size={28} /><b>Здесь будут скачанные треки</b><span>Нажми «Скачать» в меню трека или альбома — он будет играть без интернета.</span></div>
      )}
    </div>
  );
}

/** Медиатека аккаунта YouTube Music: понравившиеся и плейлисты. Показывается после входа. */
function YtLibrary() {
  const [lib, setLib] = useState<{ playlists: Card[]; liked: number } | null>(null);
  const [signed, setSigned] = useState<boolean | null>(null);
  // Перечитываем аккаунт, когда закрываются настройки — там происходит вход и смена канала
  const settingsOpen = useUi((s) => !!s.settings);
  useEffect(() => {
    if (settingsOpen) return;
    let alive = true;
    api.ytAccount().then((a) => {
      if (!alive) return;
      setSigned(a.signedIn);
      if (!a.signedIn) setLib(null);
      if (a.signedIn) api.ytLibrary().then((l) => alive && setLib({ playlists: l.playlists, liked: l.liked.length })).catch(() => {});
    }).catch(() => setSigned(false));
    return () => {
      alive = false;
    };
  }, [settingsOpen]);
  if (signed === false)
    return (
      <div className="set-row" style={{ background: 'rgba(20,20,24,.55)' }}>
        <span className="lbl"><b>Подключи YouTube Music</b><span>Твои плейлисты и понравившиеся треки из аккаунта появятся здесь</span></span>
        <button type="button" className="btn light" onClick={() => useUi.getState().openSettings('youtube')}>Войти</button>
      </div>
    );
  if (!lib) return null;
  // Вход есть, но YouTube ничего не отдал — просто ничего не показываем
  if (!lib.liked && !lib.playlists.length) return null;
  const liked: Card = { kind: 'playlist', id: 'LM', title: 'Понравившиеся в YouTube Music', subtitle: tracksWord(lib.liked) };
  return (
    <CardRow title="YouTube Music" cards={[liked, ...lib.playlists]} />
  );
}
