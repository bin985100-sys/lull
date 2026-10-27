import { create } from 'zustand';
import type { Card, DownloadEntry, DownloadProgress, Track } from '../../shared/types';
import { api } from '../api';
import { uid } from '../lib/format';

export interface LocalPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: { track: Track; addedAt: number }[];
  createdAt: number;
  pinned?: boolean;
}

export interface SavedItem {
  card: Card;
  at: number;
}

export interface MonthStats {
  /** секунд прослушано за месяц */
  sec: number;
  plays: Record<string, { track: Track; count: number; sec: number }>;
  days: Record<string, number>;
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

interface LibraryData {
  stats: Record<string, MonthStats>;
  likes: { track: Track; addedAt: number }[];
  playlists: LocalPlaylist[];
  saved: SavedItem[];
  history: { track: Track; at: number }[];
}

interface LibraryState extends LibraryData {
  downloads: Record<string, DownloadEntry>;
  progress: Record<string, DownloadProgress>;
  hydrated: boolean;
  hydrate(): Promise<void>;
  isLiked(id: string): boolean;
  toggleLike(t: Track): boolean;
  createPlaylist(name: string, tracks?: Track[]): LocalPlaylist;
  renamePlaylist(id: string, name: string, description?: string): void;
  deletePlaylist(id: string): void;
  togglePin(id: string): void;
  addToPlaylist(id: string, tracks: Track[]): number;
  removeFromPlaylist(id: string, index: number): void;
  isSaved(id: string): boolean;
  toggleSaved(card: Card): boolean;
  pushHistory(t: Track): void;
  recordListen(t: Track, sec: number, countPlay: boolean): void;
  download(t: Track): Promise<void>;
  removeDownload(id: string): Promise<void>;
}

const persist = (s: LibraryData) => api.storeSet('library', { likes: s.likes, playlists: s.playlists, saved: s.saved, history: s.history, stats: s.stats });

export const useLibrary = create<LibraryState>((set, get) => {
  const commit = (p: Partial<LibraryData>) => {
    set(p);
    void persist(get());
  };
  return {
    likes: [],
    playlists: [],
    saved: [],
    history: [],
    stats: {},
    downloads: {},
    progress: {},
    hydrated: false,

    hydrate: async () => {
      const [data, downloads] = await Promise.all([api.storeGet<Partial<LibraryData>>('library'), api.listDownloads()]);
      set({ likes: data?.likes ?? [], playlists: data?.playlists ?? [], saved: data?.saved ?? [], history: data?.history ?? [], stats: data?.stats ?? {}, downloads, hydrated: true });
      api.onDownloadProgress((p) => {
        const progress = { ...get().progress };
        if (p.done) delete progress[p.id];
        else progress[p.id] = p;
        set({ progress });
      });
    },

    isLiked: (id) => get().likes.some((l) => l.track.id === id),
    toggleLike: (t) => {
      const liked = get().isLiked(t.id);
      commit({ likes: liked ? get().likes.filter((l) => l.track.id !== t.id) : [{ track: t, addedAt: Date.now() }, ...get().likes] });
      return !liked;
    },

    createPlaylist: (name, tracks = []) => {
      const p: LocalPlaylist = { id: uid(), name, tracks: tracks.map((track) => ({ track, addedAt: Date.now() })), createdAt: Date.now() };
      commit({ playlists: [p, ...get().playlists] });
      return p;
    },
    renamePlaylist: (id, name, description) =>
      commit({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name, description } : p)) }),
    deletePlaylist: (id) => commit({ playlists: get().playlists.filter((p) => p.id !== id) }),
    togglePin: (id) => commit({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)) }),
    addToPlaylist: (id, tracks) => {
      let added = 0;
      commit({
        playlists: get().playlists.map((p) => {
          if (p.id !== id) return p;
          const have = new Set(p.tracks.map((x) => x.track.id));
          const fresh = tracks.filter((t) => !have.has(t.id));
          added = fresh.length;
          return { ...p, tracks: [...p.tracks, ...fresh.map((track) => ({ track, addedAt: Date.now() }))] };
        })
      });
      return added;
    },
    removeFromPlaylist: (id, index) =>
      commit({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((_, i) => i !== index) } : p)) }),

    isSaved: (id) => get().saved.some((s) => s.card.id === id),
    toggleSaved: (card) => {
      const saved = get().isSaved(card.id);
      commit({ saved: saved ? get().saved.filter((s) => s.card.id !== card.id) : [{ card, at: Date.now() }, ...get().saved] });
      return !saved;
    },

    pushHistory: (t) => {
      const history = [{ track: t, at: Date.now() }, ...get().history.filter((h) => h.track.id !== t.id)].slice(0, 200);
      commit({ history });
    },

    recordListen: (t, sec, countPlay) => {
      const key = monthKey();
      const day = new Date().toISOString().slice(0, 10);
      const prev = get().stats[key] ?? { sec: 0, plays: {}, days: {} };
      const p = prev.plays[t.id] ?? { track: t, count: 0, sec: 0 };
      const month: MonthStats = {
        sec: prev.sec + sec,
        plays: { ...prev.plays, [t.id]: { track: t, count: p.count + (countPlay ? 1 : 0), sec: p.sec + sec } },
        days: { ...prev.days, [day]: (prev.days[day] ?? 0) + sec }
      };
      commit({ stats: { ...get().stats, [key]: month } });
    },

    download: async (t) => {
      set({ progress: { ...get().progress, [t.id]: { id: t.id, received: 0, total: 1, done: false } } });
      try {
        const entry = await api.download(t);
        const progress = { ...get().progress };
        delete progress[t.id];
        set({ downloads: { ...get().downloads, [t.id]: entry }, progress });
      } catch (e) {
        const progress = { ...get().progress };
        delete progress[t.id];
        set({ progress });
        throw e;
      }
    },
    removeDownload: async (id) => {
      await api.removeDownload(id);
      const downloads = { ...get().downloads };
      delete downloads[id];
      set({ downloads });
    }
  };
});
