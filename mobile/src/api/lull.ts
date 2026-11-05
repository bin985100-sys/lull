/* Каталог Lull: популярные артисты, альбомы, чарты и звук с сервера Lull (api.lull.website).
   Сервер достаёт данные из YouTube Music (youtubei.js) и отдаёт поток в AAC — он играет и на iPhone. */
import { ApiError, type Artist, type Playlist, type Track } from './audius';

export const LULL_API = process.env.EXPO_PUBLIC_LULL_API || 'https://api.lull.website';

type Raw = Record<string, any>;
export type Card = { kind: 'track' | 'album' | 'playlist' | 'artist'; id: string; title: string; subtitle?: string; image?: string; track?: Track };
export type Section = { title: string; subtitle?: string; layout: 'cards' | 'tracks'; items: Card[] };
export type ArtistPage = { artist: Artist; monthly?: string; top: Track[]; sections: Section[]; similar: Artist[] };
export type CollectionPage = { meta: Playlist; tracks: Track[]; year?: string };

const enc = encodeURIComponent;

async function get<T = any>(path: string, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${LULL_API}/api/${path}`, { signal, headers: { Accept: 'application/json' } });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError('offline', 'Нет связи с сервером Lull');
  }
  if (!r.ok) throw new ApiError('http', (await r.json().catch(() => null))?.error ?? `Сервер ответил ${r.status}`, r.status);
  return r.json();
}

/* Обложки YouTube идут через сервер: так они грузятся и там, где сервисы Google медленные */
export function img(u?: string, size = 544): string | undefined {
  if (!u) return undefined;
  let url = u.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+$/, `=s${size}`);
  if (/^https:\/\/([a-z0-9-]+\.)*(ytimg\.com|ggpht\.com|googleusercontent\.com)\//.test(url)) url = `${LULL_API}/api/img?u=${enc(url)}`;
  return url;
}

export const mapTrack = (t: Raw, fallbackArt?: string): Track => ({
  id: String(t.id),
  title: t.title,
  artist: (t.artists || []).map((a: Raw) => a.name).filter(Boolean).join(', '),
  artistId: t.artists?.find((a: Raw) => a.id)?.id ?? '',
  artwork: img(t.thumb || fallbackArt, 544),
  artworkLarge: img(t.thumb || fallbackArt, 1080),
  duration: Number(t.durationSec) || 0,
  streamable: true,
  source: 'yt',
  albumId: t.album?.id,
});
const mapCard = (c: Raw): Card => ({
  kind: c.kind, id: String(c.id), title: c.title, subtitle: c.subtitle, image: img(c.thumb, c.kind === 'artist' ? 480 : 544),
  track: c.track ? mapTrack(c.track, c.thumb) : undefined,
});
const mapSection = (s: Raw): Section => ({ title: s.title, subtitle: s.subtitle, layout: s.layout, items: (s.items || []).map(mapCard) });
export const cardArtist = (c: Card): Artist => ({ id: c.id, name: c.title, handle: '', avatar: c.image, followers: 0, source: 'yt' });
export const cardPlaylist = (c: Card): Playlist => ({ id: c.id, title: c.title, artist: c.subtitle ?? '', artistId: '', artwork: c.image, trackCount: 0, source: 'yt', kind: c.kind === 'album' ? 'album' : 'playlist' });

export const streamUrlYt = (id: string) => `${LULL_API}/api/stream/${enc(id)}?q=aac`;

/* Просим сервер заранее подготовить ссылки на звук — тогда трек стартует сразу */
const warmed = new Map<string, number>();
export function warm(tracks: (Track | undefined)[]) {
  const now = Date.now();
  const ids = tracks.filter((t): t is Track => !!t && t.source === 'yt' && now - (warmed.get(t.id) || 0) > 30 * 60e3).map((t) => t.id).slice(0, 6);
  if (!ids.length) return;
  ids.forEach((id) => warmed.set(id, now));
  fetch(`${LULL_API}/api/warm?q=aac&ids=${ids.map(enc).join(',')}`).catch(() => {});
}

export const lull = {
  home: (chip?: string, s?: AbortSignal) => get<Raw[]>(`home${chip ? `?chip=${enc(chip)}` : ''}`, s).then((l) => l.map(mapSection)),
  charts: (s?: AbortSignal) => get<Raw[]>('charts', s).then((l) => l.map(mapSection)),
  async search(q: string, s?: AbortSignal) {
    const r = await get<Raw>(`search?q=${enc(q)}&f=all`, s);
    return {
      tracks: (r.tracks || []).map((t: Raw) => mapTrack(t)) as Track[],
      artists: (r.artists || []).map(mapCard).map(cardArtist) as Artist[],
      albums: (r.albums || []).map(mapCard).map(cardPlaylist) as Playlist[],
      playlists: (r.playlists || []).map(mapCard).map(cardPlaylist) as Playlist[],
    };
  },
  async artist(id: string, s?: AbortSignal): Promise<ArtistPage> {
    const a = await get<Raw>(`artist/${enc(id)}`, s);
    const sections: Section[] = (a.sections || []).map(mapSection);
    const similar = sections.filter((x) => x.items[0]?.kind === 'artist').flatMap((x) => x.items).map(cardArtist);
    return {
      artist: { id: a.id, name: a.name, handle: '', avatar: img(a.thumb, 480), cover: img(a.thumb, 1080), followers: 0, source: 'yt' },
      monthly: a.monthly,
      top: (a.topTracks || []).map((t: Raw) => mapTrack(t)),
      sections: sections.filter((x) => x.items[0]?.kind !== 'artist'),
      similar,
    };
  },
  async collection(kind: 'album' | 'playlist', id: string, s?: AbortSignal): Promise<CollectionPage> {
    const c = await get<Raw>(`${kind}/${enc(id)}`, s);
    const art = c.thumb;
    return {
      meta: { id: c.id ?? id, title: c.title, artist: c.author || c.subtitle || '', artistId: '', artwork: img(art, 1080), trackCount: c.tracks?.length ?? 0, source: 'yt', kind },
      tracks: (c.tracks || []).map((t: Raw) => mapTrack(t, kind === 'album' ? art : undefined)),
      year: c.year,
    };
  },
  upNext: (id: string, s?: AbortSignal) => get<Raw[]>(`upnext/${enc(id)}`, s).then((l) => l.map((t) => mapTrack(t))),
  /* Популярные исполнители для первого запуска: по одному запросу на имя, сервер кэширует */
  async popularArtists(s?: AbortSignal): Promise<Artist[]> {
    const names = ['The Weeknd', 'Billie Eilish', 'Taylor Swift', 'Drake', 'Dua Lipa', 'Ariana Grande', 'Travis Scott', 'Lana Del Rey', 'Imagine Dragons', 'Eminem', 'Rihanna', 'Kendrick Lamar', 'Miyagi', 'Скриптонит', 'Zivert', 'MACAN', 'Баста', 'Monetochka'];
    const res = await Promise.all(names.map((n) => get<Raw>(`search?q=${enc(n)}&f=artists`, s).then((r) => r.artists?.[0] ?? r.top).catch(() => null)));
    const seen = new Set<string>();
    return res.filter((c): c is Raw => !!c && c.kind === 'artist' && !seen.has(c.id) && !!seen.add(c.id)).map((c) => cardArtist(mapCard(c)));
  },
};
