import { memo, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { artistsText, formatTime, relativeDate } from '../lib/format';
import { openMenuAt, trackMenu } from '../lib/trackMenu';
import { cancelHoverPrefetch, hoverPrefetch, listPrefetch } from '../lib/prefetch';
import { useLibrary } from '../store/library';
import { usePlayer, type QueueSource } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { Cover } from './Cover';
import { ICheckCircle, IHeart, IHeartFill, IMore, IPlay } from './icons';

export function EqBars({ paused }: { paused?: boolean }) {
  return (
    <span className={`eq-bars ${paused ? 'paused' : ''}`} role="img" aria-label="Сейчас играет">
      <span /><span /><span />
    </span>
  );
}

export function Artists({ track }: { track: Track }) {
  return (
    <>
      {track.artists.map((a, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {a.id ? <Link to={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()}>{a.name}</Link> : a.name}
        </span>
      ))}
    </>
  );
}

const sameArtists = (a: Track, b?: Track) => !!b && a.artists.map((x) => x.name).join() === b.artists.map((x) => x.name).join();

/** Переход к альбому (или исполнителю) трека. Возвращает false, если перейти некуда. */
export function openTrackAlbum(t: Track, navigate: (to: string) => void): boolean {
  const artist = t.artists.find((a) => a.id);
  if (t.album?.id) return navigate(`/album/${t.album.id}`), true;
  if (artist?.id) return navigate(`/artist/${artist.id}`), true;
  return false;
}

function useTrackActions(list: Track[], index: number, source?: QueueSource) {
  const playTracks = usePlayer((s) => s.playTracks);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const toast = useUi((s) => s.toast);
  return {
    play: () => playTracks(list, index, source),
    dbl: () => {
      if (useSettings.getState().doubleClick === 'queue') {
        addToQueue([list[index]]);
        toast('Добавлено в очередь');
      } else playTracks(list, index, source);
    }
  };
}

function LikeButton({ track, hover = true }: { track: Track; hover?: boolean }) {
  const liked = useLibrary((s) => s.likes.some((l) => l.track.id === track.id));
  const toggle = useLibrary((s) => s.toggleLike);
  return (
    <button type="button" aria-label={liked ? 'Убрать из любимого' : 'В любимое'} aria-pressed={liked} className={`ic ic-36 ${liked ? 'liked keep' : ''} ${hover && !liked ? 'mo' : ''}`} onClick={(e) => (e.stopPropagation(), toggle(track))}>
      {liked ? <IHeartFill size={17} /> : <IHeart size={17} />}
    </button>
  );
}

interface RowProps {
  list: Track[];
  index: number;
  source?: QueueSource;
  playlistId?: string;
}

/** Компактная строка: обложка, название, исполнитель, длительность. */
export const TrackRow = memo(function TrackRow({ list, index, source }: RowProps) {
  const track = list[index];
  const navigate = useNavigate();
  const isCurrent = usePlayer((s) => s.current()?.id === track.id);
  const playing = usePlayer((s) => s.playing);
  const downloaded = useLibrary((s) => !!s.downloads[track.id]);
  const { play, dbl } = useTrackActions(list, index, source);
  const menu = (e: MouseEvent) => openMenuAt(e, trackMenu(track, navigate));
  return (
    <div className={`trow ${isCurrent ? 'current' : ''}`} onClick={(e) => !(e.target as HTMLElement).closest('a,button') && dbl()} onContextMenu={menu} onMouseEnter={() => hoverPrefetch(track)} onMouseLeave={cancelHoverPrefetch} style={{ cursor: 'pointer' }}>
      <button type="button" className="cover-link" aria-label={track.album?.id ? `Открыть альбом «${track.album.name}»` : `Играть «${track.title}»`} onClick={() => (openTrackAlbum(track, navigate) ? undefined : play())}>
        <Cover src={track.thumb} size={48} radius={10} glow />
        {isCurrent && (
          <span style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EqBars paused={!playing} />
          </span>
        )}
      </button>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span className="tt ell">{track.title}</span>
        <span className="ta ell">{downloaded && <ICheckCircle size={12} style={{ color: 'var(--ok)', verticalAlign: '-1px', marginRight: 5 }} />}{track.explicit && <span className="ebadge" title="Ненормативная лексика">E</span>}<Artists track={track} /></span>
      </span>
      <LikeButton track={track} />
      <span className="dur">{track.durationSec ? formatTime(track.durationSec) : ''}</span>
      <button type="button" aria-label="Действия с треком" className="ic ic-36" onClick={menu}><IMore size={18} /></button>
    </div>
  );
});

interface TableProps {
  tracks: Track[];
  source?: QueueSource;
  addedAt?: number[];
  playlistId?: string;
  showAlbum?: boolean;
  showCover?: boolean;
}

/** Таблица треков для альбомов и плейлистов. */
export function TrackTable({ tracks, source, addedAt, playlistId, showAlbum = true, showCover = true }: TableProps) {
  const navigate = useNavigate();
  const cur = usePlayer((s) => s.current()?.id);
  const playing = usePlayer((s) => s.playing);
  const downloads = useLibrary((s) => s.downloads);
  const playTracks = usePlayer((s) => s.playTracks);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const toast = useUi((s) => s.toast);
  const toggle = usePlayer((s) => s.toggle);

  // Без дат добавления — простой список, как в альбоме: номер/обложка, название, время
  const compact = !addedAt;
  // Длинные плейлисты (тысячи треков) рисуем частями по мере прокрутки — иначе тысячи обложек
  // грузятся разом и забивают сеть, а звук текущего трека ждёт
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(PAGE), [tracks]);
  // Первые треки открытого списка готовим заранее — клик по ним запускает звук сразу
  useEffect(() => listPrefetch(tracks), [tracks]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= tracks.length) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, tracks.length]);
  // Текущий трек должен быть виден, даже если он далеко в списке
  const curIndex = cur ? tracks.findIndex((t) => t.id === cur) : -1;
  const limit = Math.max(shown, curIndex + 20);
  return (
    <section aria-label="Треки" className={compact ? 'ttable compact' : 'ttable'} style={{ display: 'flex', flexDirection: 'column' }}>
      {!compact && <div className="ttable-head">
        <span style={{ textAlign: 'center' }}>#</span>
        <span>Название</span>
        <span>{showAlbum ? 'Альбом' : ''}</span>
        <span>{addedAt ? 'Добавлен' : ''}</span>
        <span />
        <span style={{ textAlign: 'right' }}>Время</span>
        <span />
      </div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: compact ? 0 : 8 }}>
        {tracks.slice(0, limit).map((t, i) => {
          const isCur = cur === t.id;
          const menu = (e: MouseEvent) => openMenuAt(e, trackMenu(t, navigate, { playlistId, index: i }));
          return (
            <div
              key={`${t.id}:${i}`}
              className={`trow ttable-row ${isCur ? 'current' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a,button')) return;
                if (useSettings.getState().doubleClick === 'queue') (addToQueue([t]), toast('Добавлено в очередь'));
                else playTracks(tracks, i, source);
              }}
              onContextMenu={menu}
              onMouseEnter={() => hoverPrefetch(t)}
              onMouseLeave={cancelHoverPrefetch}
            >
              <span className="num">
                {isCur ? (
                  <button type="button" aria-label={playing ? 'Пауза' : 'Играть'} onClick={toggle} style={{ display: 'inline-flex' }}>
                    <EqBars paused={!playing} />
                  </button>
                ) : (
                  <>
                    <span className="idx">{i + 1}</span>
                    <button type="button" className="hov" aria-label={`Играть «${t.title}»`} onClick={() => playTracks(tracks, i, source)}>
                      <IPlay size={15} />
                    </button>
                  </>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                {showCover && (
                  <button type="button" className="cover-link" aria-label={t.album?.id ? `Открыть альбом «${t.album.name}»` : 'Открыть исполнителя'} onClick={() => openTrackAlbum(t, navigate)}>
                    <Cover src={t.thumb} size={44} radius={10} glow={isCur} />
                  </button>
                )}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="tt ell">{t.title}</span>
                  {(showCover || t.explicit || !sameArtists(t, tracks[0])) && <span className="ta ell">{t.explicit && <span className="ebadge" title="Ненормативная лексика">E</span>}<Artists track={t} /></span>}
                </span>
              </span>
              {!compact && (
                <>
                  <span className="muted ell" style={{ fontSize: 14 }}>
                    {showAlbum && t.album && (t.album.id ? <Link to={`/album/${t.album.id}`}>{t.album.name}</Link> : t.album.name)}
                  </span>
                  <span className="muted" style={{ fontSize: 14 }}>{addedAt?.[i] ? relativeDate(addedAt[i]) : ''}</span>
                </>
              )}
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                {downloads[t.id] ? <ICheckCircle size={15} style={{ color: 'var(--ok)' }} aria-label="Скачано" /> : <LikeButton track={t} />}
              </span>
              <span className="dur" style={{ width: 'auto' }}>{t.durationSec ? formatTime(t.durationSec) : ''}</span>
              <button type="button" aria-label="Действия с треком" className="ic ic-36" onClick={menu}><IMore size={18} /></button>
            </div>
          );
        })}
        {limit < tracks.length && <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />}
      </div>
    </section>
  );
}

const PAGE = 120;

export const trackArtists = artistsText;
