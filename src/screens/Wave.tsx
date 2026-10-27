import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Cover } from '../components/Cover';
import { ICheck, IDislike, ILyrics, INext, IOpenPlayer, IPlay, IPlus, IPrev } from '../components/icons';
import { VolumeControl } from '../components/PlayerBar';
import { LyricsView, SeekBar } from '../components/NowPlaying';
import { MorphPlayIcon } from '../components/PlayerFx';
import { Artists } from '../components/Tracks';
import { WaveField } from '../components/WaveOrb';
import { WaveIntro } from '../components/WaveIntro';
import { useSettings } from '../store/settings';
import c1 from '../assets/intro/cover1.jpg';
import c2 from '../assets/intro/cover2.jpg';
import c3 from '../assets/intro/cover3.jpg';
import c4 from '../assets/intro/cover4.jpg';
import c5 from '../assets/intro/cover5.jpg';
import c6 from '../assets/intro/cover6.jpg';

/** Обложки заставки */
export const INTRO_COVERS = [c1, c2, c3, c4, c5, c6];
import { DEFAULT_PALETTE, coverPalette } from '../lib/palette';
import { useLibrary } from '../store/library';
import { useLyrics } from '../store/lyrics';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useWave } from '../store/wave';

const spring = { type: 'spring', stiffness: 260, damping: 32 } as const;

/**
 * «Моя волна»: обложка по центру, вокруг — её цвета и расходящиеся волны.
 * Снизу — трек и управление. Текст раскрывается справа, обложка плавно уезжает влево.
 */
export function WaveScreen() {
  const isWave = usePlayer((s) => s.source?.path === '/wave');
  const track = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const p = usePlayer.getState();
  const reasons = useWave((s) => s.reasons);
  const building = useWave((s) => s.building);
  const liked = useLibrary((s) => !!track && s.likes.some((l) => l.track.id === track.id));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const lyr = useLyrics();
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  // Повторный вход: волна стартует сама, кнопку не показываем
  const [starting, setStarting] = useState(() => (useSettings.getState().waveStarted || useSettings.getState().waveIntroSeen) && usePlayer.getState().source?.path !== '/wave');
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  // Заставка — один раз, при первом входе в волну
  const [intro, setIntro] = useState<'run' | 'button' | 'off'>(() => {
    const st = useSettings.getState();
    return st.waveIntro && !st.waveIntroSeen && usePlayer.getState().source?.path !== '/wave' ? 'run' : 'off';
  });
  useEffect(() => {
    if (intro !== 'run') return;
    useSettings.getState().set('waveIntroSeen', true);
    useUi.getState().setIntroRunning(true);
    return () => useUi.getState().setIntroRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openPlayer = useUi((s) => s.setNowPlaying);

  const active = isWave && !!track;
  // До запуска — цвета любимого исполнителя, потом — текущей обложки
  const idleArt = useWave((s) => s.profile?.artists[0]?.thumb);
  useEffect(() => {
    useWave.getState().refreshProfile();
  }, []);
  const art = active ? track!.thumb : idleArt;
  useEffect(() => {
    let alive = true;
    void coverPalette(art).then((pl) => alive && setPalette(pl));
    return () => {
      alive = false;
    };
  }, [art]);
  useEffect(() => {
    if (lyricsOpen && active) lyr.load(track);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOpen, active, track?.id]);
  useEffect(() => {
    if (!active) setLyricsOpen(false);
  }, [active]);

  const start = async () => {
    if (isWave) return p.toggle();
    useSettings.getState().set('waveStarted', true);
    setStarting(true);
    await p.startWave();
    setStarting(false);
  };
  // Кнопка запуска — только в первый раз. Потом волна включается сама при входе.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || intro !== 'off' || isWave) return;
    const st = useSettings.getState();
    // Кнопку уже видели (в заставке или раньше) — дальше волна стартует сама
    if (!st.waveStarted && !st.waveIntroSeen) return;
    if (!st.waveStarted) st.set('waveStarted', true);
    autoStarted.current = true;
    setStarting(true);
    void p.startWave().finally(() => setStarting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, isWave]);
  const dislike = () => {
    if (!track) return;
    useWave.getState().dislike(track);
    useUi.getState().toast('Больше не попадётся в волне');
    void p.next();
  };
  const variants = lyr.data?.alternatives ?? (lyr.data ? [lyr.data] : []);
  const current = variants[lyr.variant] ?? lyr.data;
  const reason = track && isWave ? reasons[track.id] : undefined;

  return (
    <div className={`wave-stage ${lyricsOpen ? 'with-lyrics' : ''} ${intro === 'run' ? 'intro' : ''}`}>
      <WaveField colors={palette} playing={active && playing} anchor={anchor} />
      {intro !== 'off' && <WaveIntro covers={INTRO_COVERS} onButton={() => (setIntro('button'), useUi.getState().setIntroRunning(false))} onDone={() => setIntro('off')} />}
      <LayoutGroup>
        <motion.div layout transition={spring} className="wave-main">
          <motion.div layout transition={spring} ref={anchor} className="wave-cover">
            <AnimatePresence mode="popLayout" initial={false}>
              {active ? (
                <motion.div key={track!.id} className="wave-cover-in" initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}>
                  <Cover src={track!.thumb} size="100%" radius={26} eager />
                </motion.div>
              ) : intro === 'run' ? null : starting && (useSettings.getState().waveStarted || useSettings.getState().waveIntroSeen) ? (
                <motion.div key="auto" className="wave-auto" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.25 } }} exit={{ opacity: 0 }}>
                  <span className="wave-spin" />
                </motion.div>
              ) : (
                <motion.button
                  key="start"
                  type="button"
                  className="wave-start"
                  aria-label="Запустить волну"
                  onClick={() => void start()}
                  disabled={starting}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 520, damping: 17 } }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {starting ? <span className="wave-spin" /> : <IPlay size={46} />}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence mode="wait">
            {active && (
              <motion.div key={track!.id} layout="position" transition={spring} className="wave-info" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <b className="ell">{track!.title}</b>
                <span className="ell"><Artists track={track!} /></span>
                <span className="wave-reason">{reason ?? (building ? 'Подбираю…' : '')}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Всё управление — под обложкой: позиция, переключение, текст, плеер, громкость */}
          <AnimatePresence>
            {active && (
              <motion.div layout="position" transition={spring} className="wave-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                <SeekBar />
                <div className="wave-ctrls">
                  <button type="button" className="wave-btn ghost" aria-label="Не нравится" title="Не нравится — больше не попадётся" onClick={dislike}><IDislike size={21} /></button>
                  <button type="button" className="wave-btn ghost" aria-label="Предыдущий" onClick={() => p.prev()}><IPrev size={24} /></button>
                  <motion.button type="button" className="wave-btn play" aria-label={playing ? 'Пауза' : 'Играть'} onClick={() => p.toggle()} whileTap={{ scale: 0.9 }}>
                    <MorphPlayIcon playing={playing} size={30} />
                  </motion.button>
                  <button type="button" className="wave-btn ghost" aria-label="Следующий" onClick={() => void p.next()}><INext size={24} /></button>
                  <motion.button type="button" className={`wave-btn ghost ${liked ? 'on' : ''}`} aria-label={liked ? 'Убрать из Любимого' : 'В Любимое'} aria-pressed={liked} onClick={() => toggleLike(track!)} whileTap={{ scale: 0.86 }}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={liked ? 'y' : 'n'} style={{ display: 'flex' }} initial={{ opacity: 0, rotate: -90, scale: 0.5 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 90, scale: 0.5 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
                        {liked ? <ICheck size={22} strokeWidth={2.6} /> : <IPlus size={22} strokeWidth={2.6} />}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </div>
                <div className="wave-sub-ctrls">
                  <button type="button" className={`wave-chip ${lyricsOpen ? 'on' : ''}`} aria-pressed={lyricsOpen} onClick={() => setLyricsOpen(!lyricsOpen)}><ILyrics size={17} />Текст</button>
                  <span className="wave-vol"><VolumeControl width={120} /></span>
                  <button type="button" className="wave-chip" onClick={() => openPlayer(true, 'queue')}><IOpenPlayer size={17} />Плеер</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {lyricsOpen && active && (
            <motion.section
              key="lyrics"
              className="wave-lyrics"
              aria-label="Текст песни"
              initial={{ opacity: 0, x: 60, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 60, filter: 'blur(8px)' }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <LyricsView lyr={current ?? null} loading={lyr.loading} offset={lyr.offset} />
            </motion.section>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
