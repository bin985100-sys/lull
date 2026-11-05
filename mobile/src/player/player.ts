/* Плеер: очередь живёт в нашем сторе, звук — в нативном AudioPlaylist expo-audio.
   Плейлист сам переключает треки в фоне и с экрана блокировки; мы слушаем trackChanged. */
import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist } from 'expo-audio';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { streamUrl, type Track } from '@/api/audius';
import { lull, streamUrlYt, warm } from '@/api/lull';
import { useLibrary } from '@/store/library';
import { useTaste } from '@/store/taste';
import { log, logNow, report } from '@/ui/Crash';

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
/* В плеере телефона лежат только текущий и следующий треки; base — номер первого из них в очереди приложения.
   Так очередь приложения и плеера не расходятся: раньше после волны и пропусков мог играть не тот трек. */
let base = 0;
let nativeLen = 0;
let mountedAt = 0;

function engine() {
  if (pl) return pl;
  log('engine: создаю плеер');
  pl = createAudioPlaylist({ sources: [], updateInterval: 250, loop: 'none' });
  log('engine: плеер создан');
  let said = false;
  pl.addListener('playlistStatusUpdate', (st) => {
    if (!said && (st.currentTime || 0) > 0.5) { said = true; log(`звук пошёл: ${currentTrack()?.title} t=${(st.currentTime || 0).toFixed(1)}`); console.log(`[lull] playing ${currentTrack()?.id} t=${st.currentTime}`); setTimeout(() => { said = false; }, 30000); }
    useProgress.setState({ time: st.currentTime || 0, duration: st.duration || currentTrack()?.duration || 0 });
    try { meter(st.playing, st.currentTime || 0); } catch (e) { report(e, 'meter'); }
    const s = usePlayer.getState();
    if (s.playing !== st.playing || s.buffering !== st.isBuffering) log(`статус: playing=${st.playing} buffering=${st.isBuffering} i=${st.currentIndex}/${st.trackCount}`);
    if (!loading && (s.playing !== st.playing || s.buffering !== st.isBuffering)) usePlayer.setState({ playing: st.playing, buffering: st.isBuffering });
    /* «трек закончился» верим, только если играл именно текущий трек, он реально дошёл до конца
       и с переключения прошло больше пары секунд: после clear() плеер присылает такой сигнал от прошлого трека */
    const real = st.didJustFinish && base + st.currentIndex === s.index && Date.now() - mountedAt > 2500
      && (st.duration || 0) > 5 && (st.currentTime || 0) >= (st.duration || 0) - 2;
    if (st.didJustFinish && !real) log(`пропускаю ложный конец трека: i=${st.currentIndex} t=${st.currentTime}/${st.duration}`);
    if (real && st.currentIndex >= st.trackCount - 1) {
      /* дошли до конца окна: дальше по очереди или по кругу */
      if (s.index < s.queue.length - 1) jump(s.index + 1, 'next');
      else if (s.repeat === 'all' && s.queue.length) jump(0, 'next');
      else usePlayer.setState({ playing: false });
    }
  });
  pl.addListener('trackChanged', ({ currentIndex }) => {
    log(`trackChanged: ${currentIndex} (base ${base})`);
    if (Date.now() - mountedAt < 1500 && currentIndex !== 0) return;
    const s = usePlayer.getState();
    const idx = base + currentIndex;
    if (idx === s.index || idx >= s.queue.length) return;
    usePlayer.setState({ index: idx, lastDir: currentIndex < 1 ? 'prev' : 'next' });
    try { ensureNext(); onTrackStart(); } catch (e) { report(e, 'trackChanged'); }
  });
  return pl;
}

/* «Играть поверх других приложений»: в режиме mixWithOthers Lull не забирает аудиофокус,
   поэтому TikTok, Reels и видео не ставят его на паузу — звук идёт вместе. Иначе ведём себя как обычный плеер. */
const audioMode = () => ({
  playsInSilentMode: true, shouldPlayInBackground: true,
  interruptionMode: (useLibrary.getState().settings.mixAudio ? 'mixWithOthers' : 'doNotMixPersistent') as 'mixWithOthers' | 'doNotMixPersistent',
});
async function init() {
  if (!ready) {
    log(`init: режим звука ${audioMode().interruptionMode}`);
    ready = setAudioModeAsync(audioMode()).catch(() => {});
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
  setTimeout(primeAhead, 600);
  useProgress.setState({ time: 0, duration: t.duration });
  const meta = { title: t.title, artist: t.artist, artworkUrl: t.artworkLarge || t.artwork };
  const p = pl;
  (async () => {
    await logNow(`экран блокировки: включаю для «${t.title}»`);
    try {
      p.setActiveForLockScreen(true, meta, { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false });
      log('экран блокировки: готово');
    } catch (e) { report(e, 'player.lockscreen'); }
  })();
}

function shuffled<T>(a: T[]) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* Холодный трек сервер готовит до ~10 с, а плеер Android ждёт первый байт только 8 с и замирает на 0:00.
   Поэтому сначала сами дожидаемся, пока сервер подготовит поток (крутится индикатор), и только потом отдаём трек плееру. */
const primed = new Map<string, number>();
const isPrimed = (t: Track | undefined) => !!t && (t.source !== 'yt' || Date.now() - (primed.get(t.id) || 0) < 20 * 60e3);
const priming = new Map<string, Promise<boolean>>();
function prime(t: Track | undefined): Promise<boolean> {
  if (!t || isPrimed(t)) return Promise.resolve(true);
  const had = priming.get(t.id);
  if (had) return had; // один запрос на трек, даже если его просят несколько раз
  const run = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25000);
      try {
        const r = await fetch(streamUrlYt(t.id), { headers: { Range: 'bytes=0-1' }, signal: ac.signal });
        if (r.ok) { primed.set(t.id, Date.now()); return true; }
      } catch {} finally { clearTimeout(timer); }
    }
    return false;
  })().finally(() => priming.delete(t.id));
  priming.set(t.id, run);
  return run;
}
/* Пока играет трек, готовим следующие: два ближайших целиком, ещё три — на сервере */
function primeAhead() {
  const s = usePlayer.getState();
  const next = s.queue.slice(s.index + 1, s.index + 3);
  (async () => { for (const t of next) await prime(t); })().catch(() => {});
  warm(s.queue.slice(s.index + 3, s.index + 6));
}

let loadSeq = 0;
/* loading — новый трек ещё готовится; wantPlay — что выбрал пользователь (играть/пауза) */
let loading = false;
let wantPlay = true;
/* Пока готовим новый трек, старый не должен ожить ни от кнопки, ни с экрана блокировки — убираем его из плеера */
function silence() {
  const p = engine();
  p.pause(); p.clear(); nativeLen = 0;
}
/* Переход внутри очереди: экран переключаем сразу, звук — когда сервер готов */
async function jump(i: number, dir: 'next' | 'prev') {
  try { await jumpInner(i, dir); } catch (e) { report(e, 'player.jump'); }
}
/* Поставить в плеер трек i очереди и следующий за ним, и сразу играть */
function mount(i: number) {
  const q = usePlayer.getState().queue;
  log(`mount: ${i} «${q[i]?.title}» ${q[i]?.id}`);
  const p = engine();
  p.pause();
  p.clear();
  base = i;
  p.add(source(q[i]));
  nativeLen = 1;
  if (q[i + 1]) { p.add(source(q[i + 1])); nativeLen = 2; }
  p.skipTo(0);
  if (wantPlay) p.play();
  mountedAt = Date.now();
  loading = false;
  usePlayer.setState({ playing: wantPlay, buffering: wantPlay });
  watchdog();
}
/* Трек не пошёл за 15 секунд — не зависаем на 0:00, а идём дальше */
let dogTimer: ReturnType<typeof setTimeout> | null = null;
function watchdog() {
  if (dogTimer) clearTimeout(dogTimer);
  const seq = loadSeq, idx = usePlayer.getState().index;
  dogTimer = setTimeout(() => {
    const s = usePlayer.getState();
    if (seq !== loadSeq || s.index !== idx || !wantPlay || useProgress.getState().time > 0.3) return;
    log(`трек не загрузился за 15 с, пропускаю: ${currentTrack(s)?.title}`);
    if (s.index < s.queue.length - 1) jump(s.index + 1, 'next');
  }, 15000);
}
/* Следующий трек очереди должен лежать в плеере сразу за текущим (после добавлений, волны, перемешивания) */
function ensureNext() {
  if (!pl || loading || !nativeLen) return; // пока трек готовится, окно соберёт mount()
  const s = usePlayer.getState();
  const cur = s.index - base;
  const want = s.queue[s.index + 1];
  for (let k = nativeLen - 1; k > cur; k--) pl.remove(k);
  nativeLen = cur + 1;
  if (want) { pl.add(source(want)); nativeLen++; }
}

async function jumpInner(i: number, dir: 'next' | 'prev') {
  const seq = ++loadSeq;
  const t = usePlayer.getState().queue[i];
  if (!t) return;
  wantPlay = true;
  usePlayer.setState({ index: i, lastDir: dir, playing: true });
  useProgress.setState({ time: 0, duration: t.duration || 0 });
  /* следующий трек уже лежит в плеере и готов — просто переходим на него, без перезагрузки */
  const k = i - base;
  if (pl && !loading && k > 0 && k < nativeLen && isPrimed(t)) {
    log(`быстрый переход: ${k} «${t.title}»`);
    pl.skipTo(k); pl.play();
    mountedAt = Date.now();
    for (let j = 0; j < k; j++) { pl.remove(0); nativeLen--; }
    base = i;
    ensureNext(); watchdog(); onTrackStart();
    return;
  }
  if (!isPrimed(t)) {
    loading = true;
    silence(); usePlayer.setState({ buffering: true });
    await prime(t);
    if (seq !== loadSeq) return;
  }
  mount(i);
  onTrackStart();
}
async function load(queue: Track[], index: number) {
  const seq = ++loadSeq;
  loading = true; wantPlay = true;
  silence();
  usePlayer.setState({ queue, index, lastDir: 'next', error: null, playing: true, buffering: true });
  useProgress.setState({ time: 0, duration: queue[index]?.duration || 0 });
  const t0 = Date.now();
  await logNow(`play: «${queue[index]?.title}» ${queue[index]?.id}, в очереди ${queue.length}`);
  await prime(queue[index]);
  log(`prime: ${Date.now() - t0} мс`);
  console.log(`[lull] prime ${queue[index]?.id} ${Date.now() - t0}ms`);
  if (seq !== loadSeq) return; // пока ждали, выбрали другой трек
  mount(index);
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
    wantPlay = !usePlayer.getState().playing;
    usePlayer.setState({ playing: wantPlay });
    if (loading) return; // трек ещё готовится — включится сам, если не нажали паузу
    if (wantPlay) p.play(); else p.pause();
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
    usePlayer.setState({ queue: q });
    ensureNext();
  },
  addToQueue(t: Track) {
    const s = usePlayer.getState();
    if (!currentTrack(s)) return player.play([t], t.id);
    usePlayer.setState({ queue: [...s.queue, t] });
    if (s.index === s.queue.length - 1) ensureNext();
  },
  removeAt(i: number) {
    const s = usePlayer.getState();
    if (i === s.index) return;
    const q = s.queue.slice(); q.splice(i, 1);
    if (i < s.index) base--;
    usePlayer.setState({ queue: q, index: i < s.index ? s.index - 1 : s.index });
    if (i === s.index + 1) ensureNext();
  },
  move(from: number, to: number) {
    const s = usePlayer.getState();
    if (from === s.index || to <= s.index || from === to) return;
    const q = s.queue.slice(); const [t] = q.splice(from, 1); q.splice(to, 0, t);
    usePlayer.setState({ queue: q });
    ensureNext();
  },
  /* Волна: если исходный трек уже играет, не перезапускаем его, а меняем всё, что дальше */
  startWave(list: Track[]) {
    const s = usePlayer.getState();
    const cur = currentTrack(s);
    if (cur && list[0]?.id === cur.id) {
      usePlayer.setState({ queue: [...s.queue.slice(0, s.index + 1), ...list.slice(1)], shuffle: false });
      ensureNext();
      if (!s.playing) player.toggle();
      return;
    }
    return player.play(list, list[0]?.id, { shuffle: false });
  },
  clearUpcoming() {
    const s = usePlayer.getState();
    usePlayer.setState({ queue: s.queue.slice(0, s.index + 1) });
    ensureNext();
  },
  toggleShuffle() {
    const s = usePlayer.getState();
    const on = !s.shuffle;
    if (on && currentTrack(s)) {
      const head = s.queue.slice(0, s.index + 1), rest = shuffled(s.queue.slice(s.index + 1));
      usePlayer.setState({ shuffle: on, queue: [...head, ...rest] });
      ensureNext();
    } else usePlayer.setState({ shuffle: on });
  },
  cycleRepeat() {
    const r: Repeat = ({ off: 'all', all: 'one', one: 'off' } as const)[usePlayer.getState().repeat];
    engine().loop = r === 'one' ? 'single' : 'none'; // «по кругу» для всей очереди делаем сами в конце окна
    usePlayer.setState({ repeat: r });
  },
  /* переключить «поверх других приложений» на лету */
  async setMix(on: boolean) {
    useLibrary.getState().setSetting('mixAudio', on);
    ready = setAudioModeAsync(audioMode()).catch(() => {});
    await ready;
    log(`режим звука: ${audioMode().interruptionMode}`);
  },
  expand(v: boolean) { usePlayer.setState({ expanded: v && !!currentTrack() }); },
  stop() {
    loadSeq++; loading = false; if (dogTimer) clearTimeout(dogTimer);
    if (pl) { pl.pause(); pl.clear(); nativeLen = 0; base = 0; try { pl.clearLockScreenControls(); } catch {} }
    usePlayer.setState({ queue: [], index: -1, playing: false, expanded: false });
  },
};

export const isWeb = Platform.OS === 'web';
