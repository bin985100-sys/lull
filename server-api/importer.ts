/**
 * Перенос музыки по ссылке: Spotify, Apple Music, SoundCloud, Deezer, Яндекс Музыка, YouTube Music.
 * Читаем публичный список треков сервиса, находим каждый трек в каталоге Lull (YouTube Music)
 * по названию, исполнителю и длительности. Работает в фоне: приложение создаёт задачу и опрашивает её.
 *
 *   POST /api/import {url}      → { id }
 *   GET  /api/import/<id>       → { status, name, source, done, total, matched, tracks?, missing?, artists? }
 */
import crypto from 'node:crypto';
import { album as ytAlbum, playlist as ytPlaylist, search } from '../electron/yt';
import { fetchPage, soundcloud, spotify, type Fetch, type SourceList, type SourceTrack } from '../electron/sources';
import type { Track } from '../shared/types';

export type Source = 'spotify' | 'apple' | 'soundcloud' | 'deezer' | 'yandex' | 'youtube';
export const SOURCES: Record<Source, string> = {
  spotify: 'Spotify', apple: 'Apple Music', soundcloud: 'SoundCloud', deezer: 'Deezer', yandex: 'Яндекс Музыка', youtube: 'YouTube Music',
};
const LIMIT = 500;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const f: Fetch = (u, init) => fetch(u, { ...init, redirect: 'follow' } as RequestInit);

export function detect(url: string): Source | null {
  if (/open\.spotify\.com|spotify\.link/.test(url)) return 'spotify';
  if (/music\.apple\.com|itunes\.apple\.com/.test(url)) return 'apple';
  if (/soundcloud\.com|on\.soundcloud/.test(url)) return 'soundcloud';
  if (/deezer\.com|deezer\.page\.link|dzr\.page\.link|link\.deezer/.test(url)) return 'deezer';
  if (/music\.yandex\.(ru|com|by|kz|uz)|yandex\.ru\/music/.test(url)) return 'yandex';
  if (/(music\.)?youtube\.com|youtu\.be/.test(url)) return 'youtube';
  return null;
}

/* Короткие ссылки (spotify.link, deezer.page.link, on.soundcloud.com) раскрываем до полной */
async function expand(url: string) {
  if (!/spotify\.link|page\.link|link\.deezer|on\.soundcloud/.test(url)) return url;
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  const final = r.url;
  if (final && final !== url) return final;
  const html = await r.text();
  return html.match(/https:\/\/(?:open\.spotify\.com|www\.deezer\.com|soundcloud\.com)[^"'\s<]+/)?.[0] ?? url;
}

async function json(u: string) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Сервис ответил ${r.status}`);
  return (await r.json()) as any;
}

// --- Apple Music: данные страницы (serialized-server-data) --------------------------------
async function apple(url: string): Promise<SourceList> {
  const html = await fetchPage(url, f);
  const raw = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error('Apple Music не отдал список треков — проверь, что плейлист открыт для всех');
  const root = JSON.parse(raw);
  const page = (root.data?.[0] ?? root)?.data ?? root;
  const sections: any[] = page.sections ?? [];
  const items = sections.filter((s) => s.itemKind === 'trackLockup').flatMap((s) => s.items ?? [])
    .map((t: any) => ({ title: t.title, artist: String(t.artistName ?? t.subtitleLinks?.[0]?.title ?? '').split(/,|&| feat\./)[0].trim(), durationSec: t.duration ? Math.round(t.duration / 1000) : undefined }))
    .filter((t: SourceTrack) => t.title);
  const name = page.seoData?.ogTitle?.replace(/ (?:by|on) .*$| - .*$/, '') ?? sections.find((s) => s.itemKind === 'containerDetailHeaderLockup')?.items?.[0]?.title ?? 'Из Apple Music';
  const declared = Number(html.match(/"numTracks":(\d+)/)?.[1]) || undefined;
  return { name, items, declared };
}

// --- Deezer: открытый API ------------------------------------------------------------------
async function deezer(url: string): Promise<SourceList> {
  const m = url.match(/deezer\.com\/(?:[a-z]{2}\/)?(playlist|album|track)\/(\d+)/);
  if (!m) throw new Error('Не похоже на ссылку на плейлист или альбом Deezer');
  const [, kind, id] = m;
  const dz = (t: any): SourceTrack => ({ title: t.title, artist: t.artist?.name ?? '', durationSec: t.duration });
  if (kind === 'track') { const t = await json(`https://api.deezer.com/track/${id}`); return { name: t.title, items: [dz(t)] }; }
  const meta = await json(`https://api.deezer.com/${kind}/${id}`);
  if (meta.error) throw new Error('Deezer не отдал список — проверь, что он открыт для всех');
  const items: SourceTrack[] = [];
  let next: string | undefined = `https://api.deezer.com/${kind}/${id}/tracks?limit=100`;
  while (next && items.length < LIMIT) { const p = await json(next); items.push(...(p.data ?? []).map(dz)); next = p.next; }
  return { name: meta.title ?? 'Из Deezer', items, declared: meta.nb_tracks };
}

// --- Яндекс Музыка: открытый API для публичных плейлистов и альбомов --------------------------
async function yandex(url: string): Promise<SourceList> {
  const ym = (t: any): SourceTrack => ({ title: [t.title, t.version].filter(Boolean).join(' '), artist: t.artists?.[0]?.name ?? '', durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : undefined });
  const user = url.match(/users\/([^/]+)\/playlists\/(\d+)/);
  const uuid = url.match(/\/playlists?\/((?:[a-z]{2}\.)?[0-9a-f-]{20,})/i);
  const alb = url.match(/\/album\/(\d+)(?:\/track\/(\d+))?/);
  let r: any;
  if (user) r = (await json(`https://api.music.yandex.net/users/${user[1]}/playlists/${user[2]}`)).result;
  else if (uuid) r = (await json(`https://api.music.yandex.net/playlist/${uuid[1]}`)).result;
  else if (alb) {
    const a = (await json(`https://api.music.yandex.net/albums/${alb[1]}/with-tracks`)).result;
    const all: any[] = (a.volumes ?? []).flat();
    const items = (alb[2] ? all.filter((t) => String(t.id) === alb[2]) : all).map(ym);
    return { name: a.title, items, declared: a.trackCount };
  } else throw new Error('Не похоже на ссылку на плейлист или альбом Яндекс Музыки');
  if (!r) throw new Error('Яндекс Музыка не отдала плейлист — проверь, что он открыт для всех');
  return { name: r.title ?? 'Из Яндекс Музыки', items: (r.tracks ?? []).map((x: any) => x.track).filter(Boolean).map(ym), declared: r.trackCount };
}

// --- сопоставление с каталогом Lull ---------------------------------------------------------
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]|feat\.?.*$|ft\.?.*$/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function similar(a: string, b: string) {
  const A = new Set(norm(a).split(' ').filter(Boolean)), B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let c = 0; for (const w of A) if (B.has(w)) c++;
  return c / Math.max(A.size, B.size);
}
function score(q: SourceTrack, t: Track) {
  const title = similar(q.title, t.title);
  const artist = Math.max(0, ...t.artists.map((a) => similar(q.artist, a.name)), similar(q.artist, t.artists.map((a) => a.name).join(' ')));
  const dur = q.durationSec && t.durationSec ? Math.max(0, 1 - Math.abs(q.durationSec - t.durationSec) / 20) : 0.6;
  return title * 0.55 + artist * 0.3 + dur * 0.15;
}
async function find(q: SourceTrack): Promise<Track | null> {
  const r = await search(`${q.artist} ${q.title}`.trim(), 'songs');
  let best: Track | null = null, bs = 0;
  for (const t of r.tracks.slice(0, 6)) { const s = score(q, t); if (s > bs) [best, bs] = [t, s]; }
  return bs >= 0.45 ? best : null;
}

// --- задачи ----------------------------------------------------------------------------------
type Job = {
  status: 'reading' | 'matching' | 'done' | 'error'; source: Source; service: string; name: string;
  done: number; total: number; matched: number; declared?: number; error?: string;
  tracks?: Track[]; missing?: string[]; artists?: { id: string; name: string; count: number }[]; at: number;
};
const jobs = new Map<string, Job>();
setInterval(() => { const now = Date.now(); for (const [k, j] of jobs) if (now - j.at > 60 * 60e3) jobs.delete(k); }, 5 * 60e3).unref();

export function startImport(rawUrl: string) {
  const url = String(rawUrl || '').trim().match(/https?:\/\/\S+/)?.[0] ?? '';
  const source = detect(url);
  if (!source) throw Object.assign(new Error('Вставь ссылку на плейлист или альбом из Spotify, Apple Music, SoundCloud, Deezer, Яндекс Музыки или YouTube Music'), { status: 400 });
  const id = crypto.randomBytes(9).toString('base64url');
  const job: Job = { status: 'reading', source, service: SOURCES[source], name: '', done: 0, total: 0, matched: 0, at: Date.now() };
  jobs.set(id, job);
  run(job, url).catch((e) => Object.assign(job, { status: 'error', error: (e as Error).message || 'Не получилось прочитать ссылку' }));
  return { id, source, service: job.service };
}

export function importStatus(id: string) {
  const j = jobs.get(id);
  if (!j) throw Object.assign(new Error('Перенос не найден, начни заново'), { status: 404 });
  const { at, ...pub } = j;
  return pub;
}

async function run(job: Job, url: string) {
  url = await expand(url);
  if (job.source === 'youtube') {
    const u = new URL(url);
    const list = u.searchParams.get('list');
    const browse = u.pathname.match(/\/browse\/(MPRE[\w-]+)/)?.[1];
    const col = list ? await ytPlaylist(list) : browse ? await ytAlbum(browse) : null;
    if (!col) throw new Error('В ссылке нет плейлиста или альбома');
    return finish(job, col.title, col.tracks, []);
  }
  const reader = { spotify: (u: string) => spotify(u, f), soundcloud: (u: string) => soundcloud(u, f), apple, deezer, yandex }[job.source];
  const list = await reader(url);
  const items = list.items.slice(0, LIMIT);
  if (!items.length) throw new Error('В ссылке не нашлось треков');
  Object.assign(job, { status: 'matching', name: list.name, total: items.length, declared: list.declared });
  const found: (Track | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      found[i] = await find(items[i]).catch(() => null);
      job.done++; if (found[i]) job.matched++;
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  const seen = new Set<string>();
  const tracks = (found.filter(Boolean) as Track[]).filter((t) => !seen.has(t.id) && (seen.add(t.id), true));
  finish(job, list.name, tracks, items.filter((_, i) => !found[i]).map((t) => [t.artist, t.title].filter(Boolean).join(' — ')));
}

function finish(job: Job, name: string, tracks: Track[], missing: string[]) {
  /* исполнители, которых в списке больше всего, — их предложим добавить в любимые */
  const count = new Map<string, { id: string; name: string; count: number }>();
  for (const t of tracks) for (const a of t.artists.slice(0, 1)) if (a.id) {
    const c = count.get(a.id) ?? { id: a.id, name: a.name, count: 0 }; c.count++; count.set(a.id, c);
  }
  const artists = [...count.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  Object.assign(job, { status: 'done', name, tracks, missing, artists, total: job.total || tracks.length, done: job.total || tracks.length, matched: tracks.length });
}
