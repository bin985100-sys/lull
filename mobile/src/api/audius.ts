/* Клиент открытого REST API Audius: https://api.audius.co/v1
   Ключ не обязателен; app_name нужен для учёта запросов. Ответы приводим к своим типам. */

const BASE = 'https://api.audius.co/v1';
const APP = 'Lull';
const API_KEY = process.env.EXPO_PUBLIC_AUDIUS_API_KEY;

export type Track = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artwork?: string;
  artworkLarge?: string;
  duration: number;
  genre?: string;
  streamable: boolean;
  /** откуда звук: каталог Lull (YouTube Music через сервер Lull) или Audius; старые записи без поля — Audius */
  source?: Source;
  albumId?: string;
};
export type Source = 'yt' | 'audius';
export type Artist = { id: string; name: string; handle: string; avatar?: string; cover?: string; followers: number; source?: Source };
export type Playlist = { id: string; title: string; artist: string; artistId: string; artwork?: string; trackCount: number; source?: Source; kind?: 'album' | 'playlist' };

type Raw = Record<string, any>;

function qs(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams({ app_name: APP });
  if (API_KEY) p.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
}

export class ApiError extends Error {
  constructor(public kind: 'offline' | 'http', message: string, public status?: number) {
    super(message);
  }
}

async function get<T = Raw>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${qs(params)}`, { signal, headers: { Accept: 'application/json' } });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError('offline', 'Нет подключения');
  }
  if (!res.ok) throw new ApiError('http', `Audius ответил ${res.status}`, res.status);
  const json = await res.json();
  return json.data as T;
}

const art = (a: Raw | undefined, size: '150x150' | '480x480' | '1000x1000') => a?.[size] || a?.['480x480'] || a?.['150x150'] || undefined;

export const mapTrack = (t: Raw): Track => ({
  id: String(t.id),
  title: t.title,
  artist: t.user?.name ?? '',
  artistId: String(t.user?.id ?? ''),
  artwork: art(t.artwork, '480x480'),
  artworkLarge: art(t.artwork, '1000x1000'),
  duration: Number(t.duration) || 0,
  genre: t.genre,
  streamable: t.is_streamable !== false && !t.is_delete && !t.stream_conditions,
  source: 'audius',
});
export const mapArtist = (u: Raw): Artist => ({
  id: String(u.id),
  name: u.name,
  handle: u.handle,
  avatar: art(u.profile_picture, '480x480'),
  cover: u.cover_photo?.['2000x'] || u.cover_photo?.['640x'],
  followers: u.follower_count ?? 0,
  source: 'audius',
});
export const mapPlaylist = (p: Raw): Playlist => ({
  id: String(p.id),
  title: p.playlist_name,
  artist: p.user?.name ?? '',
  artistId: String(p.user?.id ?? ''),
  artwork: art(p.artwork, '480x480'),
  trackCount: p.track_count ?? 0,
  source: 'audius',
  kind: 'playlist',
});
const tracks = (l: Raw[] | undefined) => (l || []).map(mapTrack).filter((t) => t.streamable);

export const streamUrl = (id: string) => `${BASE}/tracks/${id}/stream?${qs({})}`;

export const audius = {
  trending: (opts: { genre?: string; time?: 'week' | 'month' | 'allTime'; limit?: number } = {}, s?: AbortSignal) =>
    get<Raw[]>('/tracks/trending', { genre: opts.genre, time: opts.time ?? 'week', limit: opts.limit ?? 30 }, s).then(tracks),
  underground: (s?: AbortSignal) => get<Raw[]>('/tracks/trending/underground', { limit: 20 }, s).then(tracks),
  track: (id: string, s?: AbortSignal) => get<Raw>(`/tracks/${id}`, {}, s).then(mapTrack),
  searchTracks: (q: string, s?: AbortSignal) => get<Raw[]>('/tracks/search', { query: q, limit: 30 }, s).then(tracks),
  searchArtists: (q: string, s?: AbortSignal) => get<Raw[]>('/users/search', { query: q, limit: 12 }, s).then((l) => l.map(mapArtist)),
  searchPlaylists: (q: string, s?: AbortSignal) => get<Raw[]>('/playlists/search', { query: q, limit: 12 }, s).then((l) => l.map(mapPlaylist)),
  artist: (id: string, s?: AbortSignal) => get<Raw>(`/users/${id}`, {}, s).then(mapArtist),
  artistTracks: (id: string, s?: AbortSignal) => get<Raw[]>(`/users/${id}/tracks`, { limit: 30, sort: 'plays' }, s).then(tracks),
  related: (id: string, s?: AbortSignal) => get<Raw[]>(`/users/${id}/related`, { limit: 10 }, s).then((l) => l.map(mapArtist)),
  /* без служебного аккаунта самой платформы */
  topArtists: (s?: AbortSignal) => get<Raw[]>('/users/top', { limit: 31 }, s).then((l) => l.map(mapArtist).filter((a) => a.handle.toLowerCase() !== 'audius')),
  trendingPlaylists: (s?: AbortSignal) => get<Raw[]>('/playlists/trending', { time: 'week', limit: 20 }, s).then((l) => l.map(mapPlaylist)),
  playlist: (id: string, s?: AbortSignal) => get<Raw[]>(`/playlists/${id}`, {}, s).then((l) => mapPlaylist(l[0])),
  playlistTracks: (id: string, s?: AbortSignal) => get<Raw[]>(`/playlists/${id}/tracks`, {}, s).then(tracks),
};

/* Подборки «Под настроение» = жанровые чарты Audius. Картинки — свои. */
/* Подборки «Под настроение»: настроения каталога Lull (chip) и запасной жанр Audius. Картинки — свои. */
export const MOODS = [
  { id: 'exhale', title: 'Выдохнуть', chip: 'Релакс', genre: 'Ambient', image: require('../../assets/moods/cover_exhale.webp') },
  { id: 'motion', title: 'В движении', chip: 'В дороге', genre: 'Electronic', image: require('../../assets/moods/cover_motion.webp') },
  { id: 'focus', title: 'Сосредоточиться', chip: 'Концентрация', genre: 'Lo-Fi', image: require('../../assets/moods/cover_focus.webp') },
  { id: 'night', title: 'Ночной город', chip: 'Вечеринка', genre: 'Hip-Hop/Rap', image: require('../../assets/moods/cover_night.webp') },
] as const;
export const FOCUS_IMAGE = require('../../assets/moods/cover_foryou.webp');
