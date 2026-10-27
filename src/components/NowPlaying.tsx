import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lyrics, Track } from '../../shared/types';
import { api } from '../api';
import { formatTime } from '../lib/format';
import { swipe } from '../lib/swipe';
import { DEFAULT_PALETTE, MONO_PALETTE, coverPalette } from '../lib/palette';
import { addToPlaylistSubmenu, openMenuAt, trackMenu } from '../lib/trackMenu';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useLyrics } from '../store/lyrics';
import { AudioControls } from './AudioControls';
import { WindowControls } from './Chrome';
import { Cover } from './Cover';
import { IChevronDown, IChevronLeft, IChevronRight, IClock, IGrip, ICheck, ILyrics, IMinus, IMoreH, INext, IPlus, IPrev, IQueue, IRepeat, IRepeatOne, IShuffle, IWave } from './icons';
import { Backdrop, type BackdropMode } from './Backdrop';
import { VolumeControl, useScrub } from './PlayerBar';
import { MorphPlayIcon } from './PlayerFx';
import { SyncedLyrics } from './SyncedLyrics';
import { Artists, EqBars } from './Tracks';

// ---------------------------------------------------------------- текст песни

export function LyricsView({ lyr, loading, offset }: { lyr: Lyrics | null; loading: boolean; offset: number }) {
  const seek = usePlayer((s) => s.seek);
  if (loading) return <div className="np-empty">Ищем текст…</div>;
  if (lyr && (lyr.ttml || lyr.lrc || lyr.synced?.length)) return <SyncedLyrics lyrics={lyr} offset={offset} className="np-blyrics" onSeek={seek} />;
  if (lyr?.plain)
    return (
      <div className="np-lyrics">
        <div className="lyrics-note">Синхронного текста для этого трека не нашлось — показываю обычный, без подсветки строк</div>
        <div className="lyrics-plain">{lyr.plain}</div>
      </div>
    );
  return <div className="np-empty"><b>Текста пока нет</b><span>Для этого трека не нашлось слов ни в Better Lyrics, ни в LRCLIB, ни в YouTube Music.</span></div>;
}

const SYNC_LABEL: Record<string, string> = { syllable: 'по слогам', word: 'по словам', line: 'по строкам', none: 'без синхронизации' };

// ---------------------------------------------------------------- очередь и похожие

export function QueueView() {
  const navigate = useNavigate();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const source = usePlayer((s) => s.source);
  const { jump, move, clearUpcoming } = usePlayer.getState();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const row = (t: Track, i: number) => (
    <div
      key={`${t.id}:${i}`}
      className={`queue-item ${dragFrom === i ? 'dragging' : ''} ${over === i && dragFrom !== i ? 'over' : ''}`}
      draggable={i !== index}
      onDragStart={(e) => (setDragFrom(i), (e.dataTransfer.effectAllowed = 'move'))}
      onDragOver={(e) => (e.preventDefault(), setOver(i))}
      onDragEnd={() => (setDragFrom(null), setOver(null))}
      onDrop={(e) => {
        e.preventDefault();
        if (dragFrom != null && dragFrom !== i) move(dragFrom, i);
        setDragFrom(null);
        setOver(null);
      }}
      onClick={() => jump(i)}
      onContextMenu={(e) => openMenuAt(e, trackMenu(t, navigate, { queueIndex: i }))}
    >
      <span className="grip" aria-hidden="true"><IGrip size={14} /></span>
      <Cover src={t.thumb} size={48} radius={10} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span className="ell" style={{ fontWeight: 600, fontSize: 15, color: i === index ? 'var(--ok)' : undefined }}>{t.title}</span>
        <span className="ell muted small"><Artists track={t} /></span>
      </span>
      {i === index ? <EqBars paused={!playing} /> : <span className="time">{formatTime(t.durationSec)}</span>}
    </div>
  );

  if (!queue.length) return <div className="np-empty"><b>Очередь пуста</b><span>Включи трек, альбом или плейлист.</span></div>;
  return (
    <div className="np-list">
      <span className="np-list-h" style={{ color: 'var(--ok)' }}>Сейчас играет</span>
      {row(queue[index], index)}
      {index < queue.length - 1 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
            <span className="np-list-h">Далее{source ? ` · ${source.label}` : ''}</span>
            <button type="button" className="btn sm" onClick={clearUpcoming}>Очистить</button>
          </div>
          {queue.map((t, i) => (i > index ? row(t, i) : null))}
        </>
      )}
    </div>
  );
}

function RelatedView({ track }: { track: Track }) {
  const [list, setList] = useState<Track[] | null>(null);
  const playTracks = usePlayer((s) => s.playTracks);
  useEffect(() => {
    let alive = true;
    setList(null);
    api.upNext(track.id).then((l) => alive && setList(l.filter((t) => t.id !== track.id))).catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [track]);
  if (!list) return <div className="np-empty">Подбираем похожее…</div>;
  return (
    <div className="np-list">
      {list.map((t, i) => (
        <div key={t.id} className="queue-item" onClick={() => playTracks(list, i, { label: `Похожие на «${track.title}»` })}>
          <Cover src={t.thumb} size={48} radius={10} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span className="ell" style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</span>
            <span className="ell muted small"><Artists track={t} /></span>
          </span>
          <span className="time">{formatTime(t.durationSec)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- обложка со свайпом


/** Обложка: свайп влево — следующий трек, вправо — предыдущий; клик — к альбому. */
function SwipeCover({ track, onOpen }: { track: Track; onOpen: () => void }) {
  const dragged = useRef(false);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x + info.velocity.x * 0.2;
    const { next, prev } = usePlayer.getState();
    if (dx < -90) {
      swipe.dir = 1;
      void next();
    } else if (dx > 90) {
      swipe.dir = -1;
      prev();
    }
  };
  return (
    <div className="np-cover-wrap">
      <AnimatePresence mode="popLayout" initial={false} custom={swipe.dir}>
        <motion.button
          key={track.id}
          type="button"
          className="np-cover2"
          aria-label={track.album ? `Открыть альбом «${track.album.name}»` : 'Открыть исполнителя'}
          custom={swipe.dir}
          variants={{
            enter: (d: number) => ({ x: d * 160, opacity: 0, scale: 0.92, rotate: d * 4 }),
            center: { x: 0, opacity: 1, scale: 1, rotate: 0 },
            exit: (d: number) => ({ x: -d * 160, opacity: 0, scale: 0.92, rotate: -d * 4 })
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.55}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={onDragEnd}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onOpen();
          }}
          whileTap={{ scale: 0.985 }}
        >
          <Cover src={track.thumb} radius={20} eager glow />
        </motion.button>
      </AnimatePresence>
    </div>
  );
}

export function SeekBar() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const { ref, drag, handlers } = useScrub((r) => seek(r * duration));
  const ratio = drag ?? (duration ? position / duration : 0);
  return (
    <div className="np-seek">
      <div ref={ref} className="seekbar" role="slider" aria-label="Позиция трека" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} tabIndex={0} {...handlers}>
        <div className="r" />
        <div className="f" style={{ width: `${ratio * 100}%` }} />
        <div className="k" style={{ left: `${ratio * 100}%` }} />
      </div>
      <div className="np-times">
        <span>{formatTime(drag != null ? drag * duration : position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- экран

export function NowPlaying() {
  const open = useUi((s) => s.nowPlaying);
  const tab = useUi((s) => s.nowPlayingTab);
  const setNowPlaying = useUi((s) => s.setNowPlaying);
  const navigate = useNavigate();
  const track = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const sleep = usePlayer((s) => s.sleep);
  const p = usePlayer.getState();
  const liked = useLibrary((s) => !!track && s.likes.some((l) => l.track.id === track.id));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const animatedBg = useSettings((s) => s.animatedBg);
  const bgMode = useSettings((s) => s.background);
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);

  // текст: варианты и сдвиг синхронизации
  const lyrState = useLyrics();
  const variant = lyrState.variant;
  const offset = lyrState.offset;
  const lyrLoading = lyrState.loading;
  const lyr = lyrState.data;
  const setVariant = (f: (v: number) => number) => lyrState.setVariant(f(variant));
  const setOffset = (f: number | ((o: number) => number)) => lyrState.setOffset(typeof f === 'function' ? f(offset) : f);

  useEffect(() => {
    let alive = true;
    void coverPalette(track?.thumb).then((c) => alive && setPalette(c));
    return () => {
      alive = false;
    };
  }, [track?.thumb]);

  useEffect(() => {
    if (open) useLyrics.getState().load(track);
  }, [track?.id, open]);

  const variants = lyr?.alternatives ?? (lyr ? [lyr] : []);
  const current = variants[variant] ?? lyr;
  const close = () => setNowPlaying(false);
  const go = (to: string) => (close(), navigate(to));
  const openAlbum = () => {
    if (!track) return;
    const artist = track.artists.find((a) => a.id);
    if (track.album?.id) go(`/album/${track.album.id}`);
    else if (artist?.id) go(`/artist/${artist.id}`);
  };

  const sleepMenu = (e: React.MouseEvent) =>
    openMenuAt(e, [
      { label: '15 минут', onClick: () => p.setSleep(15) },
      { label: '30 минут', onClick: () => p.setSleep(30) },
      { label: '1 час', onClick: () => p.setSleep(60) },
      { label: 'До конца трека', onClick: () => p.setSleep('end') },
      ...(sleep ? [{ label: 'Выключить таймер', onClick: () => p.setSleep(null) }] : [])
    ]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="np" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
          <Backdrop src={track?.thumb} mode={bgMode === 'blur' ? 'cover' : (bgMode as BackdropMode)} palette={bgMode === 'mono' ? MONO_PALETTE : palette} animated={animatedBg} strong />
          <div className="np-shade" aria-hidden="true" />

          <header className="np-head drag">
            <button type="button" className="np-icon no-drag" aria-label="Свернуть плеер" onClick={close}><IChevronDown size={20} /></button>
            <div className="np-toolbar no-drag">
              <div className="np-seg" role="tablist" aria-label="Панель">
                {([['lyrics', 'Текст', <ILyrics size={16} key="l" />], ['queue', 'Очередь', <IQueue size={16} key="q" />], ['related', 'Похожие', <IWave size={16} key="r" />]] as const).map(([t, l, icon]) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setNowPlaying(true, t); if (window.matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => { const g = document.querySelector<HTMLElement>('.np-grid'); const side = document.querySelector<HTMLElement>('.np-side'); if (g && side) g.scrollTo({ top: side.offsetTop - g.offsetTop, behavior: 'smooth' }); }); }}>
                    {icon}{l}
                    {tab === t && <motion.span layoutId="np-seg" className="np-seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  </button>
                ))}
              </div>
              {tab === 'lyrics' && variants.length > 0 && (
                <div className="np-lyrtools">
                  <button type="button" aria-label="Предыдущий вариант текста" disabled={variants.length < 2} onClick={() => setVariant((v) => (v - 1 + variants.length) % variants.length)}><IChevronLeft size={15} /></button>
                  <span className="np-variant" title={current?.sync ? `Синхронизация ${SYNC_LABEL[current.sync]}` : undefined}>
                    <b>{current?.label ?? 'Текст'}</b> {variant + 1}/{variants.length}
                    {current?.match != null && <span className={`np-match ${current.match > 0.85 ? 'good' : current.match > 0.6 ? 'mid' : 'bad'}`}>{Math.min(100, current.match * 100).toFixed(0)}%</span>}
                  </span>
                  <button type="button" aria-label="Следующий вариант текста" disabled={variants.length < 2} onClick={() => setVariant((v) => (v + 1) % variants.length)}><IChevronRight size={15} /></button>
                  {current?.synced && (
                    <>
                      <span className="np-vsep" />
                      <button type="button" aria-label="Текст раньше на 0,1 с" onClick={() => setOffset((o) => Math.round((o - 0.1) * 10) / 10)}><IMinus size={14} /></button>
                      <button type="button" className="np-offset" title="Сдвиг синхронизации — нажми, чтобы сбросить" onClick={() => setOffset(0)}>
                        <IClock size={14} />
                        {offset > 0 ? '+' : ''}{offset.toFixed(1).replace('.', ',')} с
                      </button>
                      <button type="button" aria-label="Текст позже на 0,1 с" onClick={() => setOffset((o) => Math.round((o + 0.1) * 10) / 10)}><IPlus size={14} /></button>
                    </>
                  )}
                </div>
              )}
            </div>
            <WindowControls />
          </header>

          {track ? (
            <main className="np-grid">
              <section className="np-player">
                <SwipeCover track={track} onOpen={openAlbum} />
                <div className="np-meta">
                  <motion.div key={track.id} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }} initial={{ opacity: 0, x: swipe.dir * 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
                    <h1 className="ell">{track.title}</h1>
                    <span className="ell np-artist" onClick={(e) => (e.target as HTMLElement).closest('a') && close()}><Artists track={track} /></span>
                  </motion.div>
                  {/* «+» — в Любимое, превращается в «✓»; правый клик — добавить в плейлист */}
                  <motion.button
                    type="button"
                    className={`np-round np-add ${liked ? 'done' : ''}`}
                    aria-label={liked ? 'Убрать из Любимого' : 'Добавить в Любимое'}
                    aria-pressed={liked}
                    title={liked ? 'В Любимом · правый клик — в плейлист' : 'В Любимое · правый клик — в плейлист'}
                    onClick={() => toggleLike(track)}
                    onContextMenu={(e) => openMenuAt(e, addToPlaylistSubmenu([track]))}
                    whileTap={{ scale: 0.86 }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={liked ? 'y' : 'n'} style={{ display: 'flex' }} initial={{ opacity: 0, rotate: -90, scale: 0.5 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 90, scale: 0.5 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
                        {liked ? <ICheck size={24} strokeWidth={2.6} /> : <IPlus size={24} strokeWidth={2.6} />}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </div>
                <SeekBar />
                <div className="np-ctrls">
                  <button type="button" className={`np-ctl ${shuffle ? 'on' : ''}`} aria-label="Перемешать" aria-pressed={shuffle} onClick={() => p.toggleShuffle()}><IShuffle size={22} /></button>
                  <button type="button" className="np-ctl" aria-label="Предыдущий" onClick={() => ((swipe.dir = -1), p.prev())}><IPrev size={28} /></button>
                  <motion.button type="button" className="np-ctl np-play" aria-label={playing ? 'Пауза' : 'Играть'} onClick={() => p.toggle()} whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                    <MorphPlayIcon playing={playing} size={42} />
                  </motion.button>
                  <button type="button" className="np-ctl" aria-label="Следующий" onClick={() => ((swipe.dir = 1), void p.next())}><INext size={28} /></button>
                  <button type="button" className={`np-ctl ${repeat !== 'off' ? 'on' : ''}`} aria-label={repeat === 'one' ? 'Повтор трека' : repeat === 'all' ? 'Повтор очереди' : 'Повтор выключен'} onClick={() => p.cycleRepeat()}>
                    {repeat === 'one' ? <IRepeatOne size={22} /> : <IRepeat size={22} />}
                  </button>
                </div>
                <div className="np-bottom">
                  <AudioControls placement="up" className="np-icon" size={18} />
                  <span className="np-vol"><VolumeControl width={200} /></span>
                  <button type="button" className={`np-icon ${sleep ? 'on' : ''}`} aria-label="Таймер сна" title="Таймер сна" onClick={sleepMenu}><IClock size={18} /></button>
                  <button type="button" className="np-icon" aria-label="Ещё" onClick={(e) => openMenuAt(e, trackMenu(track, (to) => go(to as string)))}><IMoreH size={18} /></button>
                </div>
              </section>
              <section className="np-side" aria-label={tab === 'lyrics' ? 'Текст песни' : tab === 'queue' ? 'Очередь' : 'Похожие'}>
                {tab === 'lyrics' && <LyricsView lyr={current ?? null} loading={lyrLoading} offset={offset} />}
                {tab === 'queue' && <QueueView />}
                {tab === 'related' && <RelatedView track={track} />}
              </section>
            </main>
          ) : (
            <div className="np-empty" style={{ flex: 1 }}><b>Ничего не играет</b><span>Выбери трек на главной или в поиске.</span></div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
