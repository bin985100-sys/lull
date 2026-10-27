import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { AudioControls } from './AudioControls';
import { swipe } from '../lib/swipe';
import { useNavigate } from 'react-router-dom';
import { formatTime } from '../lib/format';
import { openMenuAt, trackMenu } from '../lib/trackMenu';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { Cover } from './Cover';
import { IOpenPlayer, IAutoplay, IHeart, IHeartFill, ILyrics, IMute, INext, IPause, IPlay, IPrev, IQueue, IRepeat, IRepeatOne, IShuffle, IVolume, IVolumeHigh } from './icons';
import { Artists } from './Tracks';

/** Перетаскиваемая полоса: возвращает долю 0..1 под курсором. */
export function useScrub(onCommit: (ratio: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const ratioAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(ratioAt(e.clientX));
  };
  const onPointerMove = (e: RPointerEvent) => drag != null && setDrag(ratioAt(e.clientX));
  const onPointerUp = (e: RPointerEvent) => {
    if (drag == null) return;
    onCommit(ratioAt(e.clientX));
    setDrag(null);
  };
  return { ref, drag, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

export function VolumeControl({ width = 96 }: { width?: number }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const v = muted ? 0 : volume;
  return (
    <>
      <button type="button" className="ic ic-40" aria-label={muted ? 'Включить звук' : 'Выключить звук'} onClick={toggleMute}>
        {v === 0 ? <IMute size={18} /> : v > 0.6 ? <IVolumeHigh size={18} /> : <IVolume size={18} />}
      </button>
      <label style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }} onWheel={(e) => setVolume(Math.max(0, Math.min(1, volume - Math.sign(e.deltaY) * 0.05)))}>
        <span className="sr">Громкость</span>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          value={Math.round(v * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          style={{ width, ['--p' as string]: `${v * 100}%` }}
        />
      </label>
    </>
  );
}

export function PlayerBar() {
  const navigate = useNavigate();
  const track = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const p = usePlayer.getState();
  const liked = useLibrary((s) => !!track && s.likes.some((l) => l.track.id === track.id));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const tint = useUi((s) => s.tint);
  const setNowPlaying = useUi((s) => s.setNowPlaying);
  const npOpen = useUi((s) => s.nowPlaying);
  const queueOpen = useUi((s) => s.queuePanel);

  const dur = duration || track?.durationSec || 0;
  const dragged = useRef(false);
  const autoplay = useSettings((s) => s.autoplay);
  const wheelAcc = useRef({ x: 0, t: 0 });
  const openAlbum = () => {
    if (!track) return;
    const artist = track.artists.find((a) => a.id);
    if (track.album?.id) navigate(`/album/${track.album.id}`);
    else if (artist?.id) navigate(`/artist/${artist.id}`);
  };
  // Горизонтальный свайп тачпадом
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - wheelAcc.current.t > 600) wheelAcc.current.x = 0;
    wheelAcc.current.t = now;
    wheelAcc.current.x += e.deltaX;
    if (wheelAcc.current.x > 120) ((wheelAcc.current.x = -1e6), (swipe.dir = 1), void p.next());
    else if (wheelAcc.current.x < -120) ((wheelAcc.current.x = 1e6), (swipe.dir = -1), p.prev());
  };
  const { ref, drag, handlers } = useScrub((r) => p.seek(r * dur));
  const ratio = drag ?? (dur ? position / dur : 0);

  return (
    <motion.div
      className="pbar"
      style={{ background: `linear-gradient(90deg, ${tint}55 0%, rgba(22,22,28,.84) 42%)` }}
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 110, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      <div
        ref={ref}
        className="pbar-progress"
        role="slider"
        aria-label="Позиция трека"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={formatTime(position)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') p.seek(position + 5);
          if (e.key === 'ArrowLeft') p.seek(Math.max(0, position - 5));
        }}
        {...handlers}
      >
        <div className="rail" />
        <div className="fill" style={{ width: `${ratio * 100}%` }} />
        <div className="knob" style={{ left: `${ratio * 100}%` }} />
      </div>
      <div className="pbar-in">
        <div className="pbar-left">
          {track ? (
            <>
              <AnimatePresence mode="popLayout" initial={false} custom={swipe.dir}>
                <motion.div
                  key={track.id}
                  className="pbar-track"
                  custom={swipe.dir}
                  variants={{ enter: (d: number) => ({ x: d * 60, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: -d * 60, opacity: 0 }) }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.5}
                  onDragStart={() => (dragged.current = true)}
                  onDragEnd={(_, info) => {
                    setTimeout(() => (dragged.current = false), 0);
                    const dx = info.offset.x + info.velocity.x * 0.15;
                    if (dx < -60) ((swipe.dir = 1), void p.next());
                    else if (dx > 60) ((swipe.dir = -1), p.prev());
                  }}
                  onWheel={onWheel}
                  onContextMenu={(e) => openMenuAt(e, trackMenu(track, navigate))}
                  title="Свайп влево/вправо — следующий/предыдущий трек"
                >
                  <button type="button" className="cover-link" aria-label={track.album ? `Открыть альбом «${track.album.name}»` : 'Открыть исполнителя'} onClick={() => !dragged.current && openAlbum()} style={{ borderRadius: 12, flexShrink: 0 }}>
                    <Cover src={track.thumb} size={52} radius={12} eager glow />
                  </button>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <button type="button" className="ell pbar-title" onClick={() => !dragged.current && openAlbum()}>
                      {track.title}
                    </button>
                    <span className="ell muted small"><Artists track={track} /></span>
                  </span>
                </motion.div>
              </AnimatePresence>
              <button type="button" className={`ic ic-40 ${liked ? 'liked' : ''}`} aria-label={liked ? 'Убрать из любимого' : 'В любимое'} aria-pressed={liked} onClick={() => toggleLike(track)}>
                {liked ? <IHeartFill size={19} /> : <IHeart size={19} />}
              </button>
            </>
          ) : (
            <span className="muted small" style={{ paddingLeft: 8 }}>Выбери что-нибудь послушать</span>
          )}
        </div>
        <div className="pbar-mid">
          <span className="time">{formatTime(drag != null ? drag * dur : position)}</span>
          <button type="button" className="ic ic-44" aria-label="Предыдущий" onClick={() => ((swipe.dir = -1), p.prev())} disabled={!track}><IPrev size={20} /></button>
          <button type="button" className="play-btn" style={{ width: 48, height: 48, opacity: loading ? 0.75 : 1 }} aria-label={playing ? 'Пауза' : 'Играть'} onClick={() => p.toggle()} disabled={!track}>
            {playing ? <IPause size={19} /> : <IPlay size={19} />}
          </button>
          <button type="button" className="ic ic-44" aria-label="Следующий" onClick={() => ((swipe.dir = 1), void p.next())} disabled={!track}><INext size={20} /></button>
          <span className="time">{formatTime(dur)}</span>
        </div>
        <div className="pbar-right">
          <div className="ctl-group">
            <button type="button" className={`ic ic-40 ${shuffle ? 'on' : ''}`} aria-label="Перемешать" aria-pressed={shuffle} onClick={() => p.toggleShuffle()}><IShuffle size={18} /></button>
            <button type="button" className={`ic ic-40 ${repeat !== 'off' ? 'on' : ''}`} aria-label={repeat === 'one' ? 'Повтор трека' : repeat === 'all' ? 'Повтор очереди' : 'Повтор выключен'} onClick={() => p.cycleRepeat()}>
              {repeat === 'one' ? <IRepeatOne size={18} /> : <IRepeat size={18} />}
            </button>
            <button type="button" className={`ic ic-40 ${autoplay ? 'on' : ''}`} aria-label="Автовоспроизведение похожих" aria-pressed={autoplay} title={autoplay ? 'Автовоспроизведение похожих: вкл' : 'Автовоспроизведение похожих: выкл'} onClick={() => useSettings.getState().set('autoplay', !autoplay)}><IAutoplay size={18} /></button>
            <button type="button" className="ic ic-40" aria-label="Текст песни" onClick={() => setNowPlaying(true, 'lyrics')}><ILyrics size={18} /></button>
            <VolumeControl />
            <AudioControls placement="up" />
            <button type="button" className={`ic ic-40 ${queueOpen ? 'on' : ''}`} aria-label="Очередь" aria-pressed={queueOpen} onClick={() => useUi.getState().toggleQueuePanel()}><IQueue size={18} /></button>
            <span className="vsep" aria-hidden="true" style={{ margin: '0 2px' }} />
            <button type="button" className="open-player" aria-label="Открыть плеер" onClick={() => setNowPlaying(!npOpen)} disabled={!track}>
              <IOpenPlayer size={18} />
              Плеер
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
