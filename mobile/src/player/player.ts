/* Плеер: очередь живёт в нашем сторе, звук — в нативном AudioPlaylist expo-audio.
   Плейлист сам переключает треки в фоне и с экрана блокировки; мы слушаем trackChanged. */
import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist } from 'expo-audio';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { streamUrl, type Track } from '@/api/audius';
import { lull, streamUrlYt, warm } from '@/api/lull';
import { useLibrary } from '@/store/library';
import { useTaste } from '@/store/taste';
import { report } from '@/ui/Crash';

export type Repeat = 'off' | 'all' | 'one';
type Dir = 'next' | 'prev';

type PlayerState = {
  queue: Track[]; // весь список, index — текущий
  index: number;
  playing: boolean;
  buffering: boolean;
  shuffle: boolean;
  repeat: Repeat;
  expanded: boolean;
  lastDir: Dir; // куда уехала обложка при смене трека
  error: string | null;
};
type Progress = { time: number; duration: number };

export const usePlayer = create<PlayerState>(() => ({
  queue: [], index: -1, playing: false, buffering: false, shuffle: false, repeat: 'off', expanded: false, lastDir: 'next', error: null,
}));
export const useProgress = create<Progress>(() => ({ time: 0, duration: 0 }));

export const currentTrack = (s: PlayerState = usePlayer.getState()) => (s.index >= 0 ? s.queue[s.index] : undefined);

let pl: AudioPlaylist | null = null;
let ready: Promise<void> | null = null;

function engine() {
  if (pl) return pl;
  pl = createAudioPlaylist({ sources: [], updateInterval: 250, loop: 'none' });
  let said = false;
  pl.addListener('playlistStatusUpdate', (st) => {
    if (!said && (st.currentTime || 0) > 0.5) { said = true; console.log(`[lull] playing ${currentTrack()?.id} t=${st.currentTime}`); setTimeout(() => { said = false; }, 30000); }
    useProgress.setState({ time: st.currentTime || 0, duration: st.duration || currentTrack()?.duration || 0 });
    try { meter(st.playing, st.currentTime || 0); } catch (e) { report(e, 'meter'); }
    const s = usePlayer.getState();
    if (s.playing !== st.playing || s.buffering !== st.isBuffering) usePlayer.setState({ playing: st.playing, buffering: st.isBuffering });
    if (st.didJustFinish && st.currentIndex >= st.trackCount - 1 && s.repeat === 'off') usePlayer.setState({ playing: false });
  });
  pl.addListener('trackChanged', ({ currentIndex, previousIndex }) => {
    const s = usePlayer.getState();
    if (currentIndex === s.index) return;
    usePlayer.setState({ index: currentIndex, lastDir: currentIndex < previousIndex ? 'prev' : 'next' });
    try { onTrackStart(); } catch (e) { report(e, 'trackChanged'); }
  });
  return pl;
}

async function init() {
  if (!ready) {
    ready = setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }
  await ready;
}

const source = (t: Track) => ({ uri: t.source === 'yt' ? streamUrlYt(t.id) : streamUrl(t.id), name: t.title });

/* ---------- учёт прослушивания: время, засчитанные прослушивания, пропуски ---------- */
let lastTs = 0, buf = 0, bufTrack: Track | undefined, counted = false;
function flush() {
  if (bufTrack && buf >= 1) useTaste.getState().addListen(bufTrack, Math.round(buf));
  buf = 0;
}
function meter(playing: boolean, time: number) {
  const now = Date.now();
  const t = currentTrack();
  if (t !== bufTrack) { flush(); bufTrack = t; counted = false; }
  if (playing && lastTs && t) {
    buf += Math.min(1.5, (now - lastTs) / 1000);
    if (!counted && (time >= 30 || (t.duration && time >= t.duration * 0.5))) { counted = true; useTaste.getState().addPlay(t); }
    if (buf >= 10) flush();
  }
  lastTs = playing ? now : 0;
}
/* Переключил сам в первые 30 секунд — считаем пропуском */
function noteSkip() {
  const t = currentTrack();
  const time = useProgress.getState().time;
  if (t && time < 30 && (t.duration || 0) > 60) useTaste.getState().addSkip(t);
}

/* Радио: когда очередь подходит к концу, дозаполняем похожими треками, как в YouTube Music */
let radioFor = '';
async function extendRadio() {
  const s = usePlayer.getState();
  const t = currentTrack(s);
  if (!t || t.source !== 'yt' || s.repeat !== 'off' || s.index < s.queue.length - 2 || radioFor === t.id) return;
  radioFor = t.id;
  try {
    const more = (await lull.upNext(t.id)).filter((x) => x?.id && !usePlayer.getState().queue.some((q) => q.id === x.id)).slice(0, 10);
    if (currentTrack()?.id !== t.id) return;
    more.forEach((x) => player.addToQueue(x));
  } catch {}
}

function onTrackStart() {
  const t = currentTrack();
  if (!t || !pl) return;
  /* радио дозаполняем чуть позже, когда трек уже стартовал, и не больше 10 треков за раз */
  setTimeout(() => extendRadio().catch((e) => report(e, 'radio')), 4000);
  try { useLibrary.getState().pushHistory(t); } catch (e) { report(e, 'history'); }
  { const s = usePlayer.getState(); warm(s.queue.slice(s.index + 2, s.index + 5)); setTimeout(() => prime(usePlayer.getState().queue[usePlayer.getState().index + 1]), 1500); }
  useProgress.setState({ time: 0, duration: t.duration });
  const meta = { title: t.title, artist: t.artist, artworkUrl: t.artworkLarge || t.artwork };
  try {
    pl.setActiveForLockScreen(true, meta, { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false });
  } catch {}
}

function shuffled<T>(a: T[]) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* Холодный трек сервер готовит до ~10 с, а плеер Android ждёт первый байт только 8 с и замирает на 0:00.
   Поэтому сначала сами дожидаемся, пока сервер подготовит поток (крутится индикатор), и только потом отдаём трек плееру. */
const primed = new Map<string, number>();
async function prime(t: Track | undefined) {
  if (!t || t.source !== 'yt' || Date.now() - (primed.get(t.id) || 0) < 20 * 60e3) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(streamUrlYt(t.id), { headers: { Range: 'bytes=0-1' }, signal: ac.signal });
    if (r.ok) primed.set(t.id, Date.now());
  } catch {} finally { clearTimeout(timer); }
}

let loadSeq = 0;
/* Переход внутри очереди: экран переключаем сразу, звук — когда сервер готов */
async function jump(i: number, dir: 'next' | 'prev') {
  try { await jumpInner(i, dir); } catch (e) { report(e, 'player.jump'); }
}
async function jumpInner(i: number, dir: 'next' | 'prev') {
  const seq = ++loadSeq;
  const t = usePlayer.getState().queue[i];
  usePlayer.setState({ index: i, lastDir: dir });
  useProgress.setState({ time: 0, duration: t?.duration || 0 });
  if (t && t.source === 'yt' && Date.now() - (primed.get(t.id) || 0) > 20 * 60e3) {
    engine().pause(); usePlayer.setState({ buffering: true });
    await prime(t);
    if (seq !== loadSeq) return;
  }
  engine().skipTo(i);
  engine().play();
  onTrackStart();
}
async function load(queue: Track[], index: number) {
  const seq = ++loadSeq;
  const p = engine();
  p.pause();
  usePlayer.setState({ queue, index, lastDir: 'next', error: null, playing: true, buffering: true });
  useProgress.setState({ time: 0, duration: queue[index]?.duration || 0 });
  const t0 = Date.now();
  await prime(queue[index]);
  console.log(`[lull] prime ${queue[index]?.id} ${Date.now() - t0}ms`);
  if (seq !== loadSeq) return; // пока ждали, выбрали другой трек
  p.clear();
  queue.forEach((t) => p.add(source(t)));
  p.skipTo(index);
  p.play();
  onTrackStart();
}

export const player = {
  /* Запуск трека из списка: остальное после него становится очередью */
  async play(list: Track[], startId?: string, opts: { shuffle?: boolean } = {}) {
    const ok = list.filter((t) => t.streamable);
    if (!ok.length) return;
    await init();
    const s = usePlayer.getState();
    const cur = currentTrack(s);
    if (startId && cur?.id === startId) return player.toggle();
    let start = Math.max(0, ok.findIndex((t) => t.id === startId));
    let q = ok;
    const shuf = opts.shuffle ?? s.shuffle;
    if (shuf) {
      const first = startId ? ok[start] : ok[Math.floor(Math.random() * ok.length)];
      q = [first, ...shuffled(ok.filter((t) => t !== first))];
      start = 0;
    }
    if (opts.shuffle !== undefined) usePlayer.setState({ shuffle: opts.shuffle });
    try { await load(q, start); } catch (e) { report(e, 'player.play'); usePlayer.setState({ playing: false, buffering: false }); }
  },
  toggle() {
    const p = engine();
    if (!currentTrack()) return;
    if (usePlayer.getState().playing) { p.pause(); usePlayer.setState({ playing: false }); }
    else { p.play(); usePlayer.setState({ playing: true }); }
  },
  next() {
    const s = usePlayer.getState();
    if (!currentTrack(s)) return;
    noteSkip();
    if (s.index < s.queue.length - 1) jump(s.index + 1, 'next');
    else if (s.repeat === 'all' && s.queue.length) jump(0, 'next');
  },
  prev() {
    const s = usePlayer.getState();
    const p = engine();
    if (!currentTrack(s)) return;
    if (useProgress.getState().time > 3 || s.index === 0) { p.seekTo(0); useProgress.setState({ time: 0 }); return; }
    jump(s.index - 1, 'prev');
  },
  seek(sec: number) { engine().seekTo(sec); useProgress.setState({ time: sec }); },
  skipTo(i: number) {
    const s = usePlayer.getState();
    if (i < 0 || i >= s.queue.length) return;
    if (i > s.index) noteSkip();
    jump(i, i < s.index ? 'prev' : 'next');
  },
  playNext(t: Track) {
    const s = usePlayer.getState();
    if (!currentTrack(s)) return player.play([t], t.id);
    const q = s.queue.slice(); q.splice(s.index + 1, 0, t);
    engine().insert(source(t), s.index + 1);
    usePlayer.setState({ queue: q });
  },
  addToQueue(t: Track) {
    const s = usePlayer.getState();
    if (!currentTrack(s)) return player.play([t], t.id);
    engine().add(source(t));
    usePlayer.setState({ queue: [...s.queue, t] });
  },
  removeAt(i: number) {
    const s = usePlayer.getState();
    if (i === s.index) return;
    const q = s.queue.slice(); q.splice(i, 1);
    engine().remove(i);
    usePlayer.setState({ queue: q, index: i < s.index ? s.index - 1 : s.index });
  },
  move(from: number, to: number) {
    const s = usePlayer.getState();
    if (from === s.index || to <= s.index || from === to) return;
    const q = s.queue.slice(); const [t] = q.splice(from, 1); q.splice(to, 0, t);
    const p = engine(); p.remove(from); p.insert(source(t), to);
    usePlayer.setState({ queue: q });
  },
  /* Волна: если исходный трек уже играет, не перезапускаем его, а меняем всё, что дальше */
  startWave(list: Track[]) {
    const s = usePlayer.getState();
    const cur = currentTrack(s);
    if (cur && list[0]?.id === cur.id) {
      const p = engine();
      for (let i = s.queue.length - 1; i > s.index; i--) p.remove(i);
      list.slice(1).forEach((t) => p.add(source(t)));
      usePlayer.setState({ queue: [...s.queue.slice(0, s.index + 1), ...list.slice(1)], shuffle: false });
      if (!s.playing) player.toggle();
      return;
    }
    return player.play(list, list[0]?.id, { shuffle: false });
  },
  clearUpcoming() {
    const s = usePlayer.getState();
    const p = engine();
    for (let i = s.queue.length - 1; i > s.index; i--) p.remove(i);
    usePlayer.setState({ queue: s.queue.slice(0, s.index + 1) });
  },
  toggleShuffle() {
    const s = usePlayer.getState();
    const on = !s.shuffle;
    if (on && currentTrack(s)) {
      const head = s.queue.slice(0, s.index + 1), rest = shuffled(s.queue.slice(s.index + 1));
      const p = engine();
      for (let i = s.queue.length - 1; i > s.index; i--) p.remove(i);
      rest.forEach((t) => p.add(source(t)));
      usePlayer.setState({ shuffle: on, queue: [...head, ...rest] });
    } else usePlayer.setState({ shuffle: on });
  },
  cycleRepeat() {
    const r: Repeat = ({ off: 'all', all: 'one', one: 'off' } as const)[usePlayer.getState().repeat];
    engine().loop = r === 'off' ? 'none' : r === 'one' ? 'single' : 'all';
    usePlayer.setState({ repeat: r });
  },
  expand(v: boolean) { usePlayer.setState({ expanded: v && !!currentTrack() }); },
  stop() {
    if (pl) { pl.pause(); pl.clear(); try { pl.clearLockScreenControls(); } catch {} }
    usePlayer.setState({ queue: [], index: -1, playing: false, expanded: false });
  },
};

export const isWeb = Platform.OS === 'web';
