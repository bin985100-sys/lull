import { create } from 'zustand';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { buildBatch, buildProfile, type TasteProfile } from '../lib/waveEngine';

/**
 * «Волна» — бесконечный поток, который подбирает следующий трек по вкусу.
 * Здесь — настройки, обратная связь (пропуски, «не нравится») и причины выбора.
 */
export type WaveMood = 'any' | 'energy' | 'calm' | 'happy' | 'sad';
export type WaveMode = 'mix' | 'favorite' | 'discover' | 'popular';

export const MOODS: [WaveMood, string][] = [
  ['any', 'Любое'],
  ['energy', 'Бодрое'],
  ['calm', 'Спокойное'],
  ['happy', 'Весёлое'],
  ['sad', 'Грустное']
];
export const MODES: [WaveMode, string, string][] = [
  ['mix', 'Сбалансированно', 'Любимое вперемешку с новым'],
  ['favorite', 'Любимое', 'Больше того, что ты слушаешь'],
  ['discover', 'Незнакомое', 'Новые исполнители в твоём стиле'],
  ['popular', 'Популярное', 'То, что слушают сейчас']
];

interface Persisted {
  mood: WaveMood;
  mode: WaveMode;
  /** id треков, которые не нравятся — в волну больше не попадут */
  disliked: string[];
  /** Пропуски по исполнителям: сколько раз пропустили в первые 30 секунд */
  skips: Record<string, number>;
  /** Сколько раз исполнителя дослушали в волне */
  finishes: Record<string, number>;
}

interface WaveState extends Persisted {
  /** Почему трек оказался в волне: id → причина */
  reasons: Record<string, string>;
  active: boolean;
  building: boolean;
  profile: TasteProfile | null;
  hydrate(): Promise<void>;
  setMood(m: WaveMood): void;
  setMode(m: WaveMode): void;
  refreshProfile(): TasteProfile;
  /** Следующая порция треков (исключая уже показанные) */
  more(exclude: Set<string>, count?: number): Promise<Track[]>;
  noteSkip(t: Track, positionSec: number): void;
  noteFinish(t: Track): void;
  dislike(t: Track): void;
  setActive(v: boolean): void;
}

const KEY = 'wave';
const artistKey = (t: Track) => t.artists[0]?.id ?? t.artists[0]?.name ?? '';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useWave = create<WaveState>((set, get) => {
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { mood, mode, disliked, skips, finishes } = get();
      void api.storeSet(KEY, { mood, mode, disliked, skips, finishes } satisfies Persisted);
    }, 400);
  };
  return {
    mood: 'any',
    mode: 'mix',
    disliked: [],
    skips: {},
    finishes: {},
    reasons: {},
    active: false,
    building: false,
    profile: null,
    hydrate: async () => {
      const d = await api.storeGet<Persisted>(KEY);
      if (d) set({ mood: d.mood ?? 'any', mode: d.mode ?? 'mix', disliked: d.disliked ?? [], skips: d.skips ?? {}, finishes: d.finishes ?? {} });
    },
    setMood: (mood) => (set({ mood }), persist()),
    setMode: (mode) => (set({ mode }), persist()),
    refreshProfile: () => {
      const p = buildProfile(get());
      set({ profile: p });
      return p;
    },
    more: async (exclude, count = 12) => {
      set({ building: true });
      try {
        const profile = get().refreshProfile();
        const { tracks, reasons } = await buildBatch(profile, get(), exclude, count);
        set({ reasons: { ...get().reasons, ...reasons } });
        return tracks;
      } finally {
        set({ building: false });
      }
    },
    noteSkip: (t, pos) => {
      if (pos > 30) return;
      const k = artistKey(t);
      if (!k) return;
      set({ skips: { ...get().skips, [k]: (get().skips[k] ?? 0) + 1 } });
      persist();
    },
    noteFinish: (t) => {
      const k = artistKey(t);
      if (!k) return;
      set({ finishes: { ...get().finishes, [k]: (get().finishes[k] ?? 0) + 1 } });
      persist();
    },
    dislike: (t) => {
      const k = artistKey(t);
      set({ disliked: [...get().disliked.filter((x) => x !== t.id), t.id].slice(-500), skips: k ? { ...get().skips, [k]: (get().skips[k] ?? 0) + 2 } : get().skips });
      persist();
    },
    setActive: (active) => set({ active })
  };
});
