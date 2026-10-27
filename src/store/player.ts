import { create } from 'zustand';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { onAction, setMeta, setPlaying, setPosition } from '../lib/mediaSession';
import { AudioEngine } from '../player/engine';
import { useLibrary } from './library';
import { useSettings } from './settings';
import { useWave } from './wave';
import { useUi } from './ui';

export type Repeat = 'off' | 'all' | 'one';
export interface QueueSource {
  label: string;
  path?: string;
}

interface PlayerState {
  queue: Track[];
  /** порядок до перемешивания — чтобы вернуть при выключении shuffle */
  original: Track[] | null;
  index: number;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  source: QueueSource | null;
  sleep: { mode: 'time'; at: number } | { mode: 'end' } | null;
  current(): Track | undefined;

  playTracks(tracks: Track[], start?: number, source?: QueueSource): void;
  playTrack(track: Track, source?: QueueSource): void;
  startRadio(track: Track): Promise<void>;
  /** «Моя волна»: поток по вкусу, подгружается бесконечно */
  startWave(): Promise<void>;
  /** Пересобрать то, что дальше в волне (после смены настроения/характера) */
  refreshWave(): Promise<void>;
  isWave(): boolean;
  toggle(): void;
  next(auto?: boolean): Promise<void>;
  prev(): void;
  jump(index: number): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  playNext(tracks: Track[]): void;
  addToQueue(tracks: Track[]): void;
  removeAt(index: number): void;
  move(from: number, to: number): void;
  clearUpcoming(): void;
  setSleep(minutes: number | 'end' | null): void;
  hydrate(): Promise<void>;
}

const shuffleArr = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

let lastTimeUpdate = 0;
let lastQueueSave = 0;
let preloadedFor = -1;
let crossfadedFor = -1;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let loadToken = 0;
let errorsInRow = 0;

const htmlEngine = new AudioEngine({
  time: (position, duration) => {
    const now = performance.now();
    if (now - lastTimeUpdate > 250) {
      lastTimeUpdate = now;
      usePlayer.setState({ position, duration: duration || usePlayer.getState().duration });
    }
    onProgress(position, duration);
  },
  ended: () => {
    const s = usePlayer.getState();
    if (s.sleep?.mode === 'end') {
      usePlayer.setState({ sleep: null, playing: false });
      return;
    }
    if (s.repeat === 'one') {
      engine.seek(0);
      void engine.play();
      return;
    }
    void s.next(true);
  },
  state: (st) => (st === 'playing' && (errorsInRow = 0), usePlayer.setState({ playing: st !== 'paused', loading: st === 'loading' })),
  error: (msg) => {
    console.warn(`[player] ошибка: ${msg}`);
    usePlayer.setState({ loading: false, playing: false });
    const s = usePlayer.getState();
    const t = s.current();
    // Показываем настоящую причину (ответ YouTube / yt-dlp), а не общее «недоступен»
    if (t)
      void api.prepareStream(t.id).then(
        () => useUi.getState().toast(msg, 'error'),
        (e) => {
          const why = String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
          // Технические ответы yt-dlp пользователю не нужны — коротко и по-русски
          useUi.getState().toast(/yt-dlp|youtube\]|HTTP|\bError\b/i.test(why) ? `«${t.title}» не удалось включить — пропускаю` : `«${t.title}»: ${why}`, 'error');
        }
      );
    else useUi.getState().toast(msg, 'error');
    // Пропускаем недоступный трек, но после трёх ошибок подряд останавливаемся
    if (++errorsInRow >= 3) return;
    if (s.index < s.queue.length - 1) setTimeout(() => void usePlayer.getState().next(true), 1200);
  }
});

/** Аудиодвижок — им пользуются текст, визуал, Discord и т.д. */
export const audioEngine = htmlEngine;
const engine = audioEngine;

// --- Учёт прослушивания для статистики ---
let listenAcc = 0;
let listenTotal = 0;
let listenCounted = false;
let lastPos = -1;
let listenTrack: Track | undefined;
function flushListen(force = false) {
  if (!listenTrack || (!force && listenAcc < 10)) return;
  const countNow = !listenCounted && (listenTotal >= 30 || (listenTrack.durationSec ? listenTotal >= listenTrack.durationSec * 0.5 : false));
  if (listenAcc > 0 || countNow) useLibrary.getState().recordListen(listenTrack, Math.round(listenAcc), countNow);
  if (countNow) listenCounted = true;
  listenAcc = 0;
}
function trackListen(position: number) {
  const t = usePlayer.getState().current();
  if (t !== listenTrack) {
    flushListen(true);
    listenTrack = t;
    listenTotal = 0;
    listenCounted = false;
    lastPos = position;
    return;
  }
  const d = position - lastPos;
  lastPos = position;
  if (d > 0 && d < 2 && usePlayer.getState().playing) {
    listenAcc += d;
    listenTotal += d;
    if (!listenCounted && listenTotal >= 30) flushListen(true);
    else flushListen();
  }
}

function onProgress(position: number, duration: number) {
  trackListen(position);
  if (performance.now() - lastQueueSave > 5000) {
    lastQueueSave = performance.now();
    schedulePersist();
  }
  const s = usePlayer.getState();
  const st = useSettings.getState();
  if (!duration || !Number.isFinite(duration)) return;
  const remaining = duration - position;
  const nextIndex = nextIndexOf(s);

  if (s.sleep?.mode === 'time' && Date.now() >= s.sleep.at) {
    engine.pause();
    usePlayer.setState({ sleep: null });
    useUi.getState().toast('Таймер сна: воспроизведение остановлено');
  }

  if (nextIndex == null || s.repeat === 'one') return;
  const next = s.queue[nextIndex];
  if ((st.gapless || st.crossfade > 0) && remaining < 25 && preloadedFor !== s.index) {
    preloadedFor = s.index;
    engine.preload(next.id, srcOf(next));
  }
  if (st.crossfade > 0 && remaining <= st.crossfade && crossfadedFor !== s.index && !engine.isFading && s.sleep?.mode !== 'end') {
    crossfadedFor = s.index;
    htmlEngine.expectedDuration = next.durationSec ?? 0;
    void engine.crossfade(next.id, srcOf(next), Math.min(st.crossfade, remaining));
    usePlayer.setState({ index: nextIndex, position: 0 });
    afterTrackStart(next);
  }
}

function nextIndexOf(s: PlayerState): number | null {
  if (s.index < s.queue.length - 1) return s.index + 1;
  if (s.repeat === 'all' && s.queue.length > 0) return 0;
  return null;
}

/** Всё, что происходит при старте нового трека: метаданные, история, нормализация, Discord. */
function afterTrackStart(track: Track) {
  useLibrary.getState().pushHistory(track);
  updateMediaSession(track);
  schedulePersist();
  const st = useSettings.getState();
  void api
    .prepareStream(track.id)
    .then((m) => {
      if (usePlayer.getState().current()?.id !== track.id) return;
      engine.setNormalization(st.normalize ? m.loudnessDb : null);
      if (!track.durationSec && m.durationSec) usePlayer.setState({ duration: m.durationSec });
    })
    .catch(() => {});
}

async function loadCurrent(autoplay: boolean, startAt?: number) {
  const s = usePlayer.getState();
  const track = s.queue[s.index];
  if (!track) return;
  const token = ++loadToken;
  preloadedFor = -1;
  crossfadedFor = -1;
  usePlayer.setState({ position: startAt ?? 0, duration: track.durationSec ?? 0, loading: true, playing: autoplay });
  htmlEngine.expectedDuration = track.durationSec ?? 0;
  // Подсказка в основной процесс: если ролик недоступен, он найдёт замену той же песни
  void api.prepareStream(track.id, false, hintOf(track)).catch(() => {});
  // Start the next preparations immediately, independently of the current
  // track's resolver. A slow first track must not delay every later skip.
  const ni = nextIndexOf(s);
  if (ni != null) for (const q of s.queue.slice(ni, ni + 3)) void api.prepareStream(q.id, true, hintOf(q)).catch(() => {});
  await htmlEngine.load(track.id, srcOf(track), { autoplay, startAt });
  if (token !== loadToken) return;
  afterTrackStart(track);
}

/** Ссылка на звук с названием и исполнителем — по ним основной процесс найдёт замену недоступного ролика. */
function srcOf(t: Track) {
  const u = api.streamUrl(t.id);
  if (!u.startsWith('media://stream/')) return u;
  return `${u}?t=${encodeURIComponent(t.title)}&a=${encodeURIComponent(t.artists?.[0]?.name ?? '')}${t.durationSec ? `&d=${Math.round(t.durationSec)}` : ''}`;
}

function hintOf(t: Track) {
  return { title: t.title, artist: t.artists?.[0]?.name ?? '', duration: t.durationSec };
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = usePlayer.getState();
    void api.storeSet('queue', { queue: s.queue.slice(0, 500), index: s.index, position: engine.position, source: s.source, volume: s.volume, shuffle: s.shuffle, repeat: s.repeat });
  }, 800);
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  original: null,
  index: 0,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  source: null,
  sleep: null,
  current: () => get().queue[get().index],

  playTracks: (tracks, start = 0, source) => {
    if (tracks.length === 0) return;
    if (get().shuffle) {
      const first = tracks[start];
      const rest = shuffleArr(tracks.filter((_, i) => i !== start));
      set({ queue: [first, ...rest], original: tracks, index: 0, source: source ?? null });
    } else {
      set({ queue: tracks, original: null, index: start, source: source ?? null });
    }
    void loadCurrent(true);
  },

  playTrack: (track, source) => {
    // Одиночный трек: играем его и сразу добираем «Волну» похожих, если включён автоплей
    set({ queue: [track], original: null, index: 0, source: source ?? { label: `Волна по «${track.title}»` } });
    void loadCurrent(true);
    if (useSettings.getState().autoplay) {
      void api.upNext(track.id).then((more) => {
        if (get().queue[0]?.id !== track.id) return;
        set({ queue: [track, ...more.filter((t) => t.id !== track.id)] });
      }).catch(() => {});
    }
  },

  startRadio: async (track) => {
    try {
      const more = await api.upNext(track.id);
      get().playTracks([track, ...more.filter((t) => t.id !== track.id)], 0, { label: `Волна по «${track.title}»` });
    } catch {
      useUi.getState().toast('Не удалось запустить волну', 'error');
    }
  },

  startWave: async () => {
    const wave = useWave.getState();
    try {
      const tracks = await wave.more(new Set(), 14);
      if (!tracks.length) return useUi.getState().toast('Пока не из чего собрать волну — послушай что-нибудь', 'error');
      get().playTracks(tracks, 0, { label: 'Моя волна', path: '/wave' });
      if (get().shuffle) get().toggleShuffle();
    } catch {
      useUi.getState().toast('Не удалось запустить волну', 'error');
    }
  },

  refreshWave: async () => {
    if (!get().isWave()) return;
    const s = get();
    const keep = s.queue.slice(0, s.index + 1);
    const more = await useWave.getState().more(new Set(keep.map((t) => t.id)), 12);
    if (!get().isWave()) return;
    set({ queue: [...keep, ...more] });
  },

  isWave: () => get().source?.path === '/wave',

  toggle: () => {
    const s = get();
    if (!s.current()) return;
    if (s.playing) engine.pause();
    else if (engine.duration === 0 && !s.loading) void loadCurrent(true, s.position);
    else void engine.play();
  },

  next: async (auto = false) => {
    const s = get();
    if (auto) console.warn(`[player] автопереход дальше: «${s.current()?.title}» на ${engine.position.toFixed(1)} из ${engine.duration.toFixed(1)} с`);
    const cur = s.current();
    if (cur && s.isWave()) {
      if (auto) useWave.getState().noteFinish(cur);
      else useWave.getState().noteSkip(cur, engine.position);
      // Волна не кончается: когда впереди мало треков — подбираем следующую порцию
      if (s.queue.length - s.index <= 4) {
        const seen = new Set(s.queue.map((t) => t.id));
        const grow = useWave.getState().more(seen, 10).then((more) => {
          if (get().isWave() && more.length) set({ queue: [...get().queue, ...more.filter((t) => !new Set(get().queue.map((q) => q.id)).has(t.id))] });
        }).catch(() => {});
        if (s.index >= s.queue.length - 1) await grow;
      }
    }
    let ni = nextIndexOf(get());
    if (ni == null && auto && useSettings.getState().autoplay && s.current() && !s.isWave()) {
      try {
        const seen = new Set(s.queue.map((t) => t.id));
        const more = (await api.upNext(s.current()!.id)).filter((t) => !seen.has(t.id));
        if (more.length) {
          set({ queue: [...get().queue, ...more] });
          ni = get().index + 1;
        }
      } catch {
        /* нет сети — просто останавливаемся */
      }
    }
    if (ni == null) {
      if (auto) set({ playing: false });
      return;
    }
    set({ index: ni });
    void loadCurrent(true);
  },

  prev: () => {
    const s = get();
    if (engine.position > 3 || s.index === 0) {
      engine.seek(0);
      return;
    }
    set({ index: s.index - 1 });
    void loadCurrent(true);
  },

  jump: (index) => {
    if (index < 0 || index >= get().queue.length) return;
    set({ index });
    void loadCurrent(true);
  },

  seek: (sec) => {
    engine.seek(sec);
    set({ position: sec });
  },

  setVolume: (v) => {
    engine.setVolume(v);
    set({ volume: v, muted: false });
    schedulePersist();
  },
  toggleMute: () => {
    const m = !get().muted;
    engine.setVolume(m ? 0 : get().volume);
    set({ muted: m });
  },

  toggleShuffle: () => {
    const s = get();
    const cur = s.current();
    if (!s.shuffle) {
      const rest = shuffleArr(s.queue.filter((_, i) => i !== s.index));
      set({ shuffle: true, original: s.queue, queue: cur ? [cur, ...rest] : rest, index: 0 });
    } else {
      const orig = s.original ?? s.queue;
      const idx = cur ? Math.max(0, orig.findIndex((t) => t.id === cur.id)) : 0;
      set({ shuffle: false, original: null, queue: orig, index: idx });
    }
    preloadedFor = -1;
    schedulePersist();
  },
  cycleRepeat: () => {
    const order: Repeat[] = ['off', 'all', 'one'];
    set({ repeat: order[(order.indexOf(get().repeat) + 1) % 3] });
    schedulePersist();
  },

  playNext: (tracks) => {
    const s = get();
    if (!s.current()) return get().playTracks(tracks);
    const q = [...s.queue];
    q.splice(s.index + 1, 0, ...tracks);
    set({ queue: q });
    preloadedFor = -1;
    schedulePersist();
  },
  addToQueue: (tracks) => {
    if (!get().current()) return get().playTracks(tracks);
    set({ queue: [...get().queue, ...tracks] });
    schedulePersist();
  },
  removeAt: (i) => {
    const s = get();
    if (i === s.index) return;
    const q = s.queue.filter((_, k) => k !== i);
    set({ queue: q, index: i < s.index ? s.index - 1 : s.index });
    preloadedFor = -1;
    schedulePersist();
  },
  move: (from, to) => {
    const s = get();
    const q = [...s.queue];
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    let index = s.index;
    if (from === s.index) index = to;
    else if (from < s.index && to >= s.index) index--;
    else if (from > s.index && to <= s.index) index++;
    set({ queue: q, index });
    preloadedFor = -1;
    schedulePersist();
  },
  clearUpcoming: () => {
    const s = get();
    set({ queue: s.queue.slice(0, s.index + 1) });
    schedulePersist();
  },

  setSleep: (m) => {
    if (m == null) set({ sleep: null });
    else if (m === 'end') set({ sleep: { mode: 'end' } });
    else set({ sleep: { mode: 'time', at: Date.now() + m * 60_000 } });
  },

  hydrate: async () => {
    const saved = await api.storeGet<{ queue: Track[]; index: number; position: number; source: QueueSource | null; volume: number; shuffle: boolean; repeat: Repeat }>('queue');
    if (!saved) return;
    engine.setVolume(saved.volume ?? 0.8);
    set({ volume: saved.volume ?? 0.8, shuffle: !!saved.shuffle, repeat: saved.repeat ?? 'off' });
    if (useSettings.getState().restoreQueue && saved.queue?.length) {
      set({ queue: saved.queue, index: Math.min(saved.index, saved.queue.length - 1), position: saved.position ?? 0, source: saved.source, duration: saved.queue[saved.index]?.durationSec ?? 0 });
      const t = saved.queue[saved.index];
      if (t) updateMediaSession(t);
    }
  }
}));

// --- Связь с настройками ------------------------------------------------------
useSettings.subscribe((s, prev) => {
  if (s.eqEnabled !== prev.eqEnabled || s.eqGains !== prev.eqGains) engine.setEq(s.eqEnabled, s.eqGains);
  if (s.outputDeviceId !== prev.outputDeviceId) void engine.setOutputDevice(s.outputDeviceId);
  if (s.normalize !== prev.normalize && !s.normalize) engine.setNormalization(null);
  if (s.speed !== prev.speed) engine.setRate(s.speed);
  if (s.pitch !== prev.pitch) engine.setPitch(s.pitch);
});
export function applyEngineSettings() {
  const s = useSettings.getState();
  engine.setEq(s.eqEnabled, s.eqGains);
  engine.setRate(s.speed ?? 1);
  engine.setPitch(s.pitch ?? 0);
}

// --- Системные медиа-клавиши и виджет Windows (SMTC) --------------------------------
function updateMediaSession(t: Track) {
  setMeta({ title: t.title, artist: t.artists.map((a) => a.name).join(', '), album: t.album?.name ?? '', artwork: t.thumb ? api.imageUrl(t.thumb) : undefined });
}
onAction('play', () => !usePlayer.getState().playing && usePlayer.getState().toggle());
onAction('pause', () => usePlayer.getState().playing && usePlayer.getState().toggle());
onAction('nexttrack', () => void usePlayer.getState().next());
onAction('previoustrack', () => usePlayer.getState().prev());
onAction('seekto', (d) => d.seekTime != null && usePlayer.getState().seek(d.seekTime));
usePlayer.subscribe((s, p) => {
  if (s.playing !== p.playing) setPlaying(s.playing);
  if (s.position !== p.position) setPosition(s.position, s.duration || s.current()?.durationSec || 0);
});

// --- Discord Rich Presence -------------------------------------------------------
let discordTimer: ReturnType<typeof setTimeout> | undefined;
usePlayer.subscribe((s, p) => {
  if (s.index === p.index && s.playing === p.playing && s.queue === p.queue) return;
  clearTimeout(discordTimer);
  discordTimer = setTimeout(() => {
    if (!useSettings.getState().discordRpc) return;
    const t = usePlayer.getState().current();
    void api.discordActivity(t ? { track: t, positionSec: engine.position, playing: usePlayer.getState().playing } : null);
  }, 600);
});
useSettings.subscribe((s, p) => {
  if (s.discordRpc !== p.discordRpc || s.discordClientId !== p.discordClientId) void api.discordConfigure(s.discordRpc, s.discordClientId);
});

// --- Пауза при отключении устройства вывода -----------------------------------------
if (navigator.mediaDevices?.addEventListener) {
  let outputs = -1;
  const count = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput').length;
  void count().then((n) => (outputs = n)).catch(() => {});
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    const n = await count().catch(() => outputs);
    if (n < outputs && useSettings.getState().pauseOnDeviceChange && usePlayer.getState().playing) engine.pause();
    outputs = n;
  });
}
