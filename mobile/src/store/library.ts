/* Личная библиотека: любимые, свои плейлисты, история, выбранные исполнители, настройки.
   Хранится на устройстве; синхронизацию с аккаунтом добавим вместе с бэкендом. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Artist, Playlist, Track } from '@/api/audius';

export type MyPlaylist = { id: string; name: string; cover?: string; tracks: Track[]; createdAt: number };
export type HistoryItem = { track: Track; at: number };

type Lib = {
  onboarded: boolean;
  account: { name: string; provider: 'Google' | 'Telegram' | null; avatar?: string; token?: string; userId?: string; youtube?: string | null };
  favArtists: Artist[];
  liked: Track[];
  savedPlaylists: Playlist[];
  playlists: MyPlaylist[];
  history: HistoryItem[];
  recentSearches: string[];
  settings: { saveHistory: boolean; balance: number; mixAudio?: boolean; bgAsked?: boolean };
  setOnboarded(v: boolean): void;
  setAccount(a: Partial<Lib['account']>): void;
  setFavArtists(a: Artist[]): void;
  toggleArtist(a: Artist): void;
  addArtists(a: Artist[]): number;
  toggleLike(t: Track): boolean;
  isLiked(id: string): boolean;
  addLikes(t: Track[]): number;
  toggleSavedPlaylist(p: Playlist): void;
  createPlaylist(name: string, tracks?: Track[]): string;
  renamePlaylist(id: string, name: string): void;
  setPlaylistTracks(id: string, tracks: Track[]): void;
  toggleInPlaylist(id: string, t: Track): boolean;
  deletePlaylist(id: string): void;
  pushHistory(t: Track): void;
  clearHistory(): void;
  pushSearch(q: string): void;
  clearSearches(): void;
  setSetting<K extends keyof Lib['settings']>(k: K, v: Lib['settings'][K]): void;
  reset(): void;
};

const initial = {
  onboarded: false,
  account: { name: '', provider: null },
  favArtists: [],
  liked: [],
  savedPlaylists: [],
  playlists: [],
  history: [],
  recentSearches: [],
  settings: { saveHistory: true, balance: 40, mixAudio: false, bgAsked: false },
} as const;

export const useLibrary = create<Lib>()(
  persist(
    (set, get) => ({
      ...(initial as any),
      setOnboarded: (v) => set({ onboarded: v }),
      setAccount: (a) => set({ account: { ...get().account, ...a } }),
      setFavArtists: (a) => set({ favArtists: a }),
      addArtists: (list) => {
        const have = new Set(get().favArtists.map((x) => x.id));
        const add = list.filter((a) => a?.id && !have.has(a.id) && (have.add(a.id), true));
        if (add.length) set({ favArtists: [...get().favArtists, ...add] });
        return add.length;
      },
      toggleArtist: (a) => {
        const has = get().favArtists.some((x) => x.id === a.id);
        set({ favArtists: has ? get().favArtists.filter((x) => x.id !== a.id) : [a, ...get().favArtists] });
      },
      toggleLike: (t) => {
        const has = get().liked.some((x) => x.id === t.id);
        set({ liked: has ? get().liked.filter((x) => x.id !== t.id) : [t, ...get().liked] });
        return !has;
      },
      addLikes: (list) => {
        const have = new Set(get().liked.map((x) => x.id));
        const add = list.filter((t) => t?.id && !have.has(t.id) && (have.add(t.id), true));
        if (add.length) set({ liked: [...get().liked, ...add] });
        return add.length;
      },
      isLiked: (id) => get().liked.some((x) => x.id === id),
      toggleSavedPlaylist: (p) => {
        const has = get().savedPlaylists.some((x) => x.id === p.id);
        set({ savedPlaylists: has ? get().savedPlaylists.filter((x) => x.id !== p.id) : [p, ...get().savedPlaylists] });
      },
      createPlaylist: (name, tracks = []) => {
        const id = 'my_' + Date.now().toString(36);
        set({ playlists: [{ id, name, tracks, createdAt: Date.now() }, ...get().playlists] });
        return id;
      },
      renamePlaylist: (id, name) => set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name } : p)) }),
      setPlaylistTracks: (id, tracks) => set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, tracks } : p)) }),
      toggleInPlaylist: (id, t) => {
        let added = false;
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id) return p;
            const has = p.tracks.some((x) => x.id === t.id);
            added = !has;
            return { ...p, tracks: has ? p.tracks.filter((x) => x.id !== t.id) : [...p.tracks, t] };
          }),
        });
        return added;
      },
      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),
      pushHistory: (t) => {
        if (!get().settings.saveHistory) return;
        const h = get().history.filter((x) => !(x.track.id === t.id && Date.now() - x.at < 10 * 60e3));
        set({ history: [{ track: t, at: Date.now() }, ...h].slice(0, 200) });
      },
      clearHistory: () => set({ history: [] }),
      pushSearch: (q) => set({ recentSearches: [q, ...get().recentSearches.filter((x) => x !== q)].slice(0, 8) }),
      clearSearches: () => set({ recentSearches: [] }),
      setSetting: (k, v) => set({ settings: { ...get().settings, [k]: v } }),
      reset: () => set({ ...(initial as any) }),
    }),
    { name: 'lull.library.v1', storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);
