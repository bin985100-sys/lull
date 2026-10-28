import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import logoUrl from '../assets/logo.svg';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { Cover } from './Cover';
import { IHome, IHomeFill, ILibrary, INext, IPause, IPlay, ISearch, ISliders, IWaveNav } from './icons';

const QUERY = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)';

/** Телефон или узкое окно: нижняя навигация и мини-плеер вместо боковой панели. */
export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export function MobileHeader() {
  const openSettings = useUi((s) => s.openSettings);
  return (
    <div className="m-head">
      <img src={logoUrl} alt="Lull" className="m-logo" draggable={false} />
      <b className="m-brand">Lull</b>
      <button type="button" className="m-gear" aria-label="Настройки" onClick={() => openSettings()}>
        <ISliders size={20} />
      </button>
    </div>
  );
}

export function MobileTabBar() {
  const tab = (to: string, label: string, icon: (a: boolean) => ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `m-tab ${isActive ? 'on' : ''}`}>
      {({ isActive }) => (
        <>
          {icon(isActive)}
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="m-tabs" aria-label="Навигация">
      {tab('/', 'Главная', (a) => (a ? <IHomeFill size={22} /> : <IHome size={22} />), true)}
      {tab('/search', 'Поиск', (a) => <ISearch size={22} strokeWidth={a ? 2.6 : 2} />)}
      {tab('/wave', 'Волна', (a) => <IWaveNav size={23} strokeWidth={a ? 2.6 : 2} />)}
      {tab('/library', 'Библиотека', (a) => <ILibrary size={22} strokeWidth={a ? 2.6 : 2} />)}
    </nav>
  );
}

export function MiniPlayer() {
  const track = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const setNowPlaying = useUi((s) => s.setNowPlaying);
  const dur = duration || track?.durationSec || 0;
  return (
    <AnimatePresence>
      {track && (
        <motion.div className="m-mini" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}>
          <button type="button" className="m-mini-open" aria-label="Открыть плеер" onClick={() => setNowPlaying(true)}>
            <Cover src={track.thumb} size={44} radius={10} eager />
            <span className="m-mini-text">
              <b className="ell">{track.title}</b>
              <span className="ell">{track.artists.map((a) => a.name).join(', ')}</span>
            </span>
          </button>
          <button type="button" className="m-mini-btn" aria-label={playing ? 'Пауза' : 'Играть'} onClick={() => usePlayer.getState().toggle()}>
            {loading ? <span className="m-spin" /> : playing ? <IPause size={22} /> : <IPlay size={22} />}
          </button>
          <button type="button" className="m-mini-btn" aria-label="Следующий" onClick={() => void usePlayer.getState().next()}>
            <INext size={22} />
          </button>
          <span className="m-mini-prog" style={{ width: `${dur ? Math.min(100, (position / dur) * 100) : 0}%` }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
