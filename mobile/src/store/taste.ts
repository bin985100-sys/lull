/* Вкус слушателя: сколько и что он слушает по месяцам, что пропускает и что скрыл, настройки рекомендаций.
   Всё хранится на устройстве и используется подборками, волной и карточками на главной. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Source, Track } from '@/api/audius';

export type ArtistStat = { key: string; id: string; name: string; source?: Source; secs: number; plays: number; first: number };
export type TrackStat = { track: Track; secs: number; plays: number; skips: number; last: number };
export type MonthStat = { secs: number; artists: Record<string, ArtistStat>; tracks: Record<string, TrackStat>; days: Record<string, number> };

export type Balance = 0 | 1 | 2 | 3 | 4; // только любимое … только новое
export type WaveMode = 'sound' | 'artist' | 'discover' | 'favorite' | 'calm' | 'energy';
export type RecoSettings = {
  balance: Balance;
  useSkips: boolean; // пропуск в первые 30 секунд — минус к треку и исполнителю
  noRepeatHours: 0 | 2 | 12 | 24 | 72; // не повторять недавно прослушанное
  perArtist: 1 | 2 | 3 | 5; // не больше N треков одного исполнителя подряд в подборке
  similarArtists: boolean; // подмешивать похожих исполнителей
  timeOfDay: boolean; // спокойнее ночью, бодрее утром
  waveMode: WaveMode;
  waveLength: 25 | 50 | 100;
};

type Taste = {
  months: Record<string, MonthStat>;
  artistSkips: Record<string, number>;
  hiddenTracks: Record<string, { title: string; artist: string }>;
  hiddenArtists: Record<string, { name: string }>;
  reco: RecoSettings;
  addListen(t: Track, secs: number): void;
  addPlay(t: Track): void;
  addSkip(t: Track): void;
  hideTrack(t: Track): void;
  hideArtist(t: Track): void;
  unhideTrack(id: string): void;
  unhideArtist(key: string): void;
  setReco<K extends keyof RecoSettings>(k: K, v: RecoSettings[K]): void;
  resetTaste(): void;
};

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const artistKey = (t: Pick<Track, 'artistId' | 'artist'>) => t.artistId || 'n:' + t.artist.toLowerCase();
const dayKey = () => new Date().toISOString().slice(0, 10);
const emptyMonth = (): MonthStat => ({ secs: 0, artists: {}, tracks: {}, days: {} });
const DEFAULT_RECO: RecoSettings = { balance: 2, useSkips: true, noRepeatHours: 2, perArtist: 2, similarArtists: true, timeOfDay: true, waveMode: 'sound', waveLength: 50 };

function touch(s: Taste, t: Track) {
  const mk = monthKey();
  const m = s.months[mk] ? { ...s.months[mk] } : emptyMonth();
  const ak = artistKey(t);
  const a = m.artists[ak] ? { ...m.artists[ak] } : { key: ak, id: t.artistId, name: t.artist.split(',')[0], source: t.source, secs: 0, plays: 0, first: Date.now() };
  const tr = m.tracks[t.id] ? { ...m.tracks[t.id] } : { track: t, secs: 0, plays: 0, skips: 0, last: 0 };
  return { mk, m, ak, a, tr };
}

export const useTaste = create<Taste>()(
  persist(
    (set, get) => ({
      months: {},
      artistSkips: {},
      hiddenTracks: {},
      hiddenArtists: {},
      reco: DEFAULT_RECO,
      addListen: (t, secs) => {
        if (secs <= 0) return;
        const s = get();
        const { mk, m, ak, a, tr } = touch(s, t);
        a.secs += secs; tr.secs += secs; tr.last = Date.now(); m.secs += secs;
        m.days = { ...m.days, [dayKey()]: (m.days[dayKey()] || 0) + secs };
        set({ months: { ...s.months, [mk]: { ...m, artists: { ...m.artists, [ak]: a }, tracks: { ...m.tracks, [t.id]: tr } } } });
      },
      addPlay: (t) => {
        const s = get();
        const { mk, m, ak, a, tr } = touch(s, t);
        a.plays += 1; tr.plays += 1; tr.last = Date.now();
        set({ months: { ...s.months, [mk]: { ...m, artists: { ...m.artists, [ak]: a }, tracks: { ...m.tracks, [t.id]: tr } } } });
      },
      addSkip: (t) => {
        const s = get();
        if (!s.reco.useSkips) return;
        const { mk, m, tr } = touch(s, t);
        tr.skips += 1;
        const ak = artistKey(t);
        set({ months: { ...s.months, [mk]: { ...m, tracks: { ...m.tracks, [t.id]: tr } } }, artistSkips: { ...s.artistSkips, [ak]: (s.artistSkips[ak] || 0) + 1 } });
      },
      hideTrack: (t) => set({ hiddenTracks: { ...get().hiddenTracks, [t.id]: { title: t.title, artist: t.artist } } }),
      hideArtist: (t) => set({ hiddenArtists: { ...get().hiddenArtists, [artistKey(t)]: { name: t.artist.split(',')[0] } } }),
      unhideTrack: (id) => { const h = { ...get().hiddenTracks }; delete h[id]; set({ hiddenTracks: h }); },
      unhideArtist: (k) => { const h = { ...get().hiddenArtists }; delete h[k]; set({ hiddenArtists: h }); },
      setReco: (k, v) => set({ reco: { ...get().reco, [k]: v } }),
      resetTaste: () => set({ months: {}, artistSkips: {}, hiddenTracks: {}, hiddenArtists: {}, reco: DEFAULT_RECO }),
    }),
    { name: 'lull.taste.v1', storage: createJSONStorage(() => AsyncStorage), version: 1, merge: (p: any, c) => ({ ...c, ...p, reco: { ...DEFAULT_RECO, ...(p?.reco || {}) } }) }
  )
);

/* ---------- выборки для карточек и подборок ---------- */
export function monthStats(mk = monthKey()) {
  const m = useTaste.getState().months[mk];
  if (!m) return null;
  const artists = Object.values(m.artists).sort((a, b) => b.secs - a.secs);
  const tracks = Object.values(m.tracks).sort((a, b) => b.plays - a.plays || b.secs - a.secs);
  return { secs: m.secs, artists, tracks, days: m.days };
}
export function prevMonthKey() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
export const monthName = (d = new Date()) => MONTHS[d.getMonth()];
export const monthIn = (d = new Date()) => MONTHS_IN[d.getMonth()];
export function fmtListen(secs: number) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
