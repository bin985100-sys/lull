import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Rail, TopBar } from './components/Chrome';
import { ContextMenu } from './components/ContextMenu';
import { PlayerBar } from './components/PlayerBar';
import { InstallSheet } from './web/InstallSheet';
import { isWebBuild } from './api';
import { MiniPlayer, MobileHeader, MobileTabBar, useIsMobile } from './components/MobileChrome';
import { PlaylistDialog } from './components/PlaylistDialog';
import { SettingsModal } from './components/SettingsModal';
import { ISearch } from './components/icons';
import { SearchOverlay } from './components/SearchOverlay';
import { ImportDialog } from './components/ImportDialog';
import { NowPlaying, QueueView } from './components/NowPlaying';
import { ICheck, IClose } from './components/icons';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DEFAULT_PALETTE, MONO_PALETTE, coverPalette } from './lib/palette';
import { Backdrop, type BackdropMode } from './components/Backdrop';
import { ArtistScreen } from './screens/Artist';
import { BackButton, CollectionScreen } from './screens/Collection';
import { Home } from './screens/Home';
import { WaveScreen } from './screens/Wave';
import { Library } from './screens/Library';
import { Search, SearchBox } from './screens/Search';
import { useLibrary } from './store/library';
import { usePlayer } from './store/player';
import { useSettings } from './store/settings';
import { useUi } from './store/ui';

function Ambient() {
  const track = usePlayer((s) => s.current());
  const setTint = useUi((s) => s.setTint);
  const tint = useUi((s) => s.tint);
  const homeCovers = useUi((s) => s.homeCovers);
  const pageArt = useUi((s) => s.pageArt);
  const bg = useSettings((s) => s.background);
  const animated = useSettings((s) => s.animatedBg);
  const location = useLocation();
  const onHome = location.pathname === '/';
  const [coverPal, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const palette = bg === 'mono' ? MONO_PALETTE : coverPal;
  const bgMode: BackdropMode = bg === 'blur' ? 'cover' : (bg as BackdropMode);
  const [step, setStep] = useState(0);

  // На главной фон по кругу перетекает в цвета обложек подборок, на остальных — цвет текущего трека
  // Страница артиста/альбома окрашивает фон своей обложкой — как только уходишь с неё, фон возвращается к треку
  const sources = (pageArt ? [pageArt] : onHome ? (track ? [track.thumb] : homeCovers.slice(0, 8)) : [track?.thumb]).filter(Boolean) as string[];
  const src = sources.length ? sources[step % sources.length] : undefined;
  useEffect(() => {
    if (!onHome || sources.length < 2 || !animated) return;
    const t = setInterval(() => setStep((n) => n + 1), 9000);
    return () => clearInterval(t);
  }, [onHome, sources.length, animated]);
  useEffect(() => {
    let alive = true;
    void coverPalette(src).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [src]);
  useEffect(() => {
    let active = true;
    void coverPalette(pageArt ?? track?.thumb).then((p) => { if (active) setTint(p[0]); });
    return () => { active = false; };
  }, [pageArt, track?.thumb, setTint]);
  useEffect(() => {
    document.documentElement.style.setProperty('--tint', tint);
  }, [tint]);

  return (
    <div className="ambient-wrap" aria-hidden="true">
      <Backdrop src={src} mode={bgMode} palette={palette} animated={animated} />
      <div className={`ambient-shade ${bgMode === 'gradient' ? '' : 'cover'}`} />
    </div>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.kind}`} initial={{ opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {t.kind === 'ok' && <ICheck size={16} style={{ color: '#3ddc84', flexShrink: 0 }} />}
            {t.text.includes(' · ') ? <span>{t.text.split(' · ')[0]}<span className="muted"> · {t.text.split(' · ').slice(1).join(' · ')}</span></span> : t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function useHotkeys() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      const p = usePlayer.getState();
      const ui = useUi.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setNowPlaying(false);
        if (window.location.hash.startsWith('#/search')) window.dispatchEvent(new Event('focus-search'));
        else if (ui.search) window.dispatchEvent(new Event('focus-search-overlay'));
        else ui.setSearch(true);
        return;
      }
      if (e.key === 'Escape') {
        if (ui.menu) return;
        if (ui.search) return ui.setSearch(false);
        if (ui.settings) return ui.closeSettings();
        if (ui.nowPlaying) return ui.setNowPlaying(false);
      }
      if (typing) return;
      // Пока открыт поиск, буквы — это запрос, а не горячие клавиши (иначе «l» ставит лайк, «m» глушит звук)
      if (ui.search) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) window.dispatchEvent(new Event('focus-search-overlay'));
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      // По коду клавиши, а не по букве — чтобы работало и в русской раскладке
      const k = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      switch (true) {
        case e.code === 'Space':
          e.preventDefault();
          p.toggle();
          break;
        case ctrl && e.key === 'ArrowRight':
          void p.next();
          break;
        case ctrl && e.key === 'ArrowLeft':
          p.prev();
          break;
        case e.shiftKey && e.key === 'ArrowRight':
          p.seek(p.position + 10);
          break;
        case e.shiftKey && e.key === 'ArrowLeft':
          p.seek(Math.max(0, p.position - 10));
          break;
        case ctrl && e.key === 'ArrowUp':
          e.preventDefault();
          p.setVolume(Math.min(1, p.volume + 0.05));
          break;
        case ctrl && e.key === 'ArrowDown':
          e.preventDefault();
          p.setVolume(Math.max(0, p.volume - 0.05));
          break;
        case !ctrl && !e.altKey && k === 'm':
          p.toggleMute();
          break;
        case !ctrl && !e.altKey && k === 'l': {
          const cur = p.current();
          if (cur) ui.toast(useLibrary.getState().toggleLike(cur) ? 'Добавлено в любимое' : 'Убрано из любимого');
          break;
        }
        case !ctrl && !e.altKey && k === 's':
          p.toggleShuffle();
          break;
        case !ctrl && !e.altKey && k === 'r':
          p.cycleRepeat();
          break;
        case !ctrl && !e.altKey && k === 'f':
          ui.setNowPlaying(!ui.nowPlaying);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

function Shell() {
  const location = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const isSearch = location.pathname === '/search';
  const isRoot = ['/', '/search', '/library', '/wave'].includes(location.pathname);
  const searchOpen = useUi((s) => s.search);
  const setSearch = useUi((s) => s.setSearch);
  const queuePanel = useUi((s) => s.queuePanel);
  const hasTrack = usePlayer((s) => !!s.current());
  const waveActive = usePlayer((s) => s.source?.path === '/wave');
  const introRunning = useUi((s) => s.introRunning);
  // В «Волне» всё управление под обложкой — нижняя панель не нужна
  const onWave = location.pathname === '/wave';
  const showBar = hasTrack && !introRunning && !(onWave && waveActive);
  useHotkeys();
  const mobile = useIsMobile();
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    useUi.getState().closeMenu();
    useUi.getState().setSearch(false);
  }, [location.pathname]);

  return (
    <div className={`app ${mobile ? 'mobile' : ''} ${searchOpen ? 'searching' : ''} ${queuePanel ? 'with-queue' : ''} ${showBar ? '' : 'no-bar'} ${introRunning ? 'intro-black' : ''}`}>
      <Ambient />
      {!mobile && <Rail />}
      <div className="main">
        {mobile && location.pathname === '/' && <MobileHeader />}
        {mobile && (!isRoot || isSearch) && (
          <div className="m-top">
            {!isRoot && <BackButton />}
            <div ref={setSlot} style={{ display: 'contents' }} />
            {isSearch && <SearchBox slot={slot} />}
          </div>
        )}
        {!mobile && <TopBar>
          {!isRoot && <BackButton />}
          <div ref={setSlot} style={{ display: 'contents' }} />
          {!isSearch && !searchOpen && (
            <motion.button layoutId="search-pill" type="button" className="field no-drag search-pill" onClick={() => setSearch(true)} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
              <ISearch size={17} />
              <span style={{ flex: 1, textAlign: 'left' }}>Поиск</span>
              <span className="kbd" style={{ height: 22, fontSize: 11 }}>Ctrl K</span>
            </motion.button>
          )}
          {!isSearch && searchOpen && <span className="search-pill" aria-hidden="true" style={{ visibility: 'hidden' }} />}
          {isSearch && <SearchBox slot={slot} />}
        </TopBar>}
        <div ref={scroller} className="scroll">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/liked" element={<CollectionScreen kind="liked" />} />
                <Route path="/downloads" element={<CollectionScreen kind="downloads" />} />
                <Route path="/local/:id" element={<CollectionScreen kind="local" />} />
                <Route path="/album/:id" element={<CollectionScreen kind="album" />} />
                <Route path="/playlist/:id" element={<CollectionScreen kind="playlist" />} />
                <Route path="/artist/:id" element={<ArtistScreen />} />
                <Route path="/mix/:id" element={<CollectionScreen kind="mix" />} />
                <Route path="/wave" element={<WaveScreen />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {queuePanel && (
          <motion.aside className="qpanel" aria-label="Очередь" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="qpanel-head"><b>Очередь</b><button type="button" className="ic ic-36" aria-label="Закрыть очередь" onClick={() => useUi.getState().toggleQueuePanel()}><IClose size={16} /></button></div>
            <QueueView />
          </motion.aside>
        )}
      </AnimatePresence>
      {/* Нижняя панель появляется, только когда что-то выбрано */}
      {mobile ? (
        <div className="m-dock">
          {!introRunning && !(onWave && waveActive) && <MiniPlayer />}
          <MobileTabBar />
        </div>
      ) : (
        <AnimatePresence>{showBar && <PlayerBar key="pbar" />}</AnimatePresence>
      )}
      <SearchOverlay />
      <NowPlaying />
      <SettingsModal />
      <PlaylistDialog />
      <ImportDialog />
      <ConfirmDialog />
      <ContextMenu />
      <Toasts />
      {isWebBuild && <InstallSheet />}
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
