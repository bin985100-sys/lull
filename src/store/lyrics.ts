import { create } from 'zustand';
import type { Lyrics, Track } from '../../shared/types';
import { api } from '../api';

/**
 * Текст текущего трека — общий для полноэкранного плеера и оверлея.
 * Сдвиг синхронизации и выбранный вариант запоминаются для каждого трека.
 */
interface Prefs {
  offset: number;
  variant: number;
}

interface LyricsState {
  trackId: string | null;
  data: Lyrics | null;
  loading: boolean;
  variant: number;
  offset: number;
  prefs: Record<string, Prefs>;
  load(track: Track | undefined): void;
  setVariant(v: number): void;
  setOffset(o: number): void;
  current(): Lyrics | null;
  variants(): Lyrics[];
  hydrate(): Promise<void>;
}

let token = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useLyrics = create<LyricsState>((set, get) => {
  const savePrefs = () => {
    const { trackId, variant, offset, prefs } = get();
    if (!trackId) return;
    const next = { ...prefs };
    if (variant === 0 && offset === 0) delete next[trackId];
    else next[trackId] = { variant, offset };
    set({ prefs: next });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void api.storeSet('lyricPrefs2', next), 500);
  };
  return {
    trackId: null,
    data: null,
    loading: false,
    variant: 0,
    offset: 0,
    prefs: {},
    load: (track) => {
      if (!track) return set({ trackId: null, data: null, loading: false });
      if (get().trackId === track.id && (get().data || get().loading)) return;
      const t = ++token;
      const pref = get().prefs[track.id];
      set({ trackId: track.id, data: null, loading: true, variant: pref?.variant ?? 0, offset: pref?.offset ?? 0 });
      api
        .lyrics(track)
        .then((d) => t === token && set({ data: d }))
        .catch(() => t === token && set({ data: null }))
        .finally(() => t === token && set({ loading: false }));
    },
    setVariant: (v) => {
      set({ variant: v });
      savePrefs();
    },
    setOffset: (o) => {
      set({ offset: Math.round(o * 10) / 10 });
      savePrefs();
    },
    variants: () => {
      const d = get().data;
      return d?.alternatives ?? (d ? [d] : []);
    },
    current: () => {
      const list = get().variants();
      return list[get().variant] ?? get().data;
    },
    hydrate: async () => {
      const prefs = await api.storeGet<Record<string, Prefs>>('lyricPrefs2');
      if (prefs) set({ prefs });
    }
  };
});
