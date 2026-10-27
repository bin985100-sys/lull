import { xfetch } from './relay';
import type { WebContents } from 'electron';
import type { ImportResult, Track } from '../shared/types';
import { IPC } from '../shared/api';
import { playlist as ytPlaylist, album as ytAlbum, search } from './yt';
import { soundcloud as soundcloudSrc, spotify as spotifySrc, type Fetch, type SourceTrack } from './sources';

const fetcher: Fetch = (u, init) => xfetch(u, init as any);
const spotify = (url: string) => spotifySrc(url, fetcher);
const soundcloud = (url: string) => soundcloudSrc(url, fetcher);

/**
 * Импорт плейлиста по ссылке. YouTube/YouTube Music — напрямую; Spotify и
 * SoundCloud — читаем список треков с публичной страницы и находим каждый на YouTube Music
 * (сверяя название, исполнителя и длительность).
 */
export type { SourceTrack };


const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]|feat\.?.*$|ft\.?.*$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Похожесть строк 0..1 по общим словам. */
export function similar(a: string, b: string): number {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

export function matchScore(q: SourceTrack, t: Track): number {
  const title = similar(q.title, t.title);
  const artist = Math.max(...t.artists.map((a) => similar(q.artist, a.name)), similar(q.artist, t.artists.map((a) => a.name).join(' ')));
  const dur = q.durationSec && t.durationSec ? Math.max(0, 1 - Math.abs(q.durationSec - t.durationSec) / 20) : 0.6;
  return title * 0.55 + artist * 0.3 + dur * 0.15;
}

async function findOnYouTube(q: SourceTrack): Promise<Track | null> {
  const r = await search(`${q.artist} ${q.title}`, 'songs');
  let best: Track | null = null;
  let bestScore = 0;
  for (const t of r.tracks.slice(0, 6)) {
    const s = matchScore(q, t);
    if (s > bestScore) [best, bestScore] = [t, s];
  }
  return bestScore >= 0.45 ? best : null;
}

// --- чтение источников -------------------------------------------------------------

export function detectSource(url: string): ImportResult['source'] | null {
  if (/(music\.)?youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/open\.spotify\.com/.test(url)) return 'spotify';
  if (/soundcloud\.com/.test(url)) return 'soundcloud';
  return null;
}

export async function importPlaylist(url: string, sender: WebContents): Promise<ImportResult> {
  const source = detectSource(url);
  if (!source) throw new Error('Поддерживаются ссылки YouTube, Spotify и SoundCloud');
  const progress = (done: number, total: number, matched: number) => !sender.isDestroyed() && sender.send(IPC.importProgress, { done, total, matched });

  if (source === 'youtube') {
    const u = new URL(url);
    const list = u.searchParams.get('list');
    const browse = u.pathname.match(/\/browse\/(MPRE[\w-]+)/)?.[1];
    const col = list ? await ytPlaylist(list) : browse ? await ytAlbum(browse) : null;
    if (!col) throw new Error('В ссылке нет плейлиста или альбома');
    progress(col.tracks.length, col.tracks.length, col.tracks.length);
    return { name: col.title, source, total: col.tracks.length, tracks: col.tracks, missing: [] };
  }

  const { name, items, declared } = source === 'spotify' ? await spotify(url) : await soundcloud(url);
  const res = await matchAll(name, source, items, progress);
  // Сервис мог отдать не весь список (например, Spotify без входа — первые 100)
  return declared && declared > res.total ? { ...res, total: declared } : res;
}

/** Найти список треков на YouTube Music (4 поиска параллельно — быстро и без лишней нагрузки). */
export async function matchAll(
  name: string,
  source: ImportResult['source'],
  items: SourceTrack[],
  progress: (done: number, total: number, matched: number) => void
): Promise<ImportResult> {
  if (!items.length) throw new Error('Список треков пуст');
  const found: (Track | null)[] = new Array(items.length).fill(null);
  let done = 0;
  let matched = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        found[i] = await findOnYouTube(items[i]);
      } catch {
        found[i] = null;
      }
      done++;
      if (found[i]) matched++;
      progress(done, items.length, matched);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const tracks = found.filter(Boolean) as Track[];
  const missing = items.filter((_, i) => !found[i]).map((t) => `${t.artist} — ${t.title}`);
  return { name, source, total: items.length, tracks, missing };
}
