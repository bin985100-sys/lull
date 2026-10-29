import { xfetch } from './relay';
import { app } from 'electron';
import type { LyricLine, Lyrics, Track } from '../shared/types';
import { ytLyrics } from './yt';
import { matchScore, similar } from './importer';

const cache = new Map<string, Lyrics>();
const settleWithin = <T>(request: Promise<T>, milliseconds: number, fallback: T): Promise<T> => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(fallback), milliseconds);
  request.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
});

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (stamps.length === 0) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

interface LrcLibItem {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Версии с изменённым темпом (Speed Up, Sped Up, Slowed, Nightcore…) — у них тот же текст,
 * что у оригинала, но другая длительность. Ищем оригинал и растягиваем тайминги.
 */
const TEMPO_RE = /\b(speed\s*up|sped\s*up|super\s*sped|nightcore|ultra\s*slowed|slowed(\s*\+?\s*reverb)?|slowed\s*down|reverb|speed|ускоренн\w*|замедленн\w*)\b/i;
export const isTempoVersion = (title: string) => TEMPO_RE.test(title);

/** Название без приписок: (Speed Up), [Slowed + Reverb], (feat. …), - Remastered и т.п. */
export function cleanTitle(title: string): string {
  return title
    .replace(/[([][^)\]]*(speed|sped|slowed|reverb|nightcore|feat\.?|ft\.?|prod\.?|remaster|version|edit|ускор|замедл)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(speed|sped|slowed|reverb|nightcore|remaster|version|edit).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function lrclibCandidates(track: Track): Promise<LrcLibItem[]> {
  const headers = { 'User-Agent': `Player/${app.getVersion()} (desktop music player)` };
  const artist = track.artists[0]?.name ?? '';
  const tempo = isTempoVersion(track.title);
  const title = cleanTitle(track.title) || track.title;
  const out: LrcLibItem[] = [];
  const add = (i: LrcLibItem) => {
    if (!i || (!i.syncedLyrics && !i.plainLyrics)) return;
    if (out.some((o) => (o.syncedLyrics ?? o.plainLyrics) === (i.syncedLyrics ?? i.plainLyrics))) return;
    out.push(i);
  };
  // 1. Точное совпадение (для версий с другим темпом длительность не передаём — она не совпадёт)
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (track.album?.name && !tempo) params.set('album_name', track.album.name);
  if (track.durationSec && !tempo) params.set('duration', String(Math.round(track.durationSec)));
  try {
    const r = await xfetch(`https://lrclib.net/api/get?${params}`, { headers, signal: AbortSignal.timeout(2500) });
    if (r.ok) add((await r.json()) as LrcLibItem);
  } catch {
    /* дальше поиск */
  }
  if (out.some(item => item.syncedLyrics)) return out;
  // 2. Поиск: по полям и по общей строке
  const queries = [new URLSearchParams({ track_name: title, artist_name: artist }), new URLSearchParams({ q: `${artist} ${title}` })];
  if (title !== track.title) queries.push(new URLSearchParams({ q: `${artist} ${track.title}` }));
  const d = track.durationSec ?? 0;
  for (const q of queries) {
    if (out.length >= 4) break;
    try {
      const r = await xfetch(`https://lrclib.net/api/search?${q}`, { headers, signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      const list = ((await r.json()) as LrcLibItem[])
        .filter((i) => (i.syncedLyrics || i.plainLyrics) && (tempo || !d || Math.abs(i.duration - d) < 8))
        .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || (tempo ? 0 : Math.abs(a.duration - d) - Math.abs(b.duration - d)));
      for (const i of list) {
        add(i);
        if (out.length >= 4) break;
      }
    } catch {
      /* следующий запрос */
    }
  }
  return out;
}

/** Растянуть тайминги LRC под длительность трека (для Speed Up / Slowed). */
function scaleLrc(lrc: string, k: number): string {
  const fmtT = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  };
  return lrc.replace(/([[<])(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)([\]>])/g, (_m, o: string, mm: string, ss: string, c: string) => `${o}${fmtT((Number(mm) * 60 + Number(ss.replace(':', '.'))) * k)}${c}`);
}

/** То же для TTML: атрибуты begin/end в форматах «12.3», «1:02.5», «00:01:02.500». */
function scaleTtml(ttml: string, k: number): string {
  return ttml.replace(/\b(begin|end|dur)="([\d:.]+)s?"/g, (_m, attr: string, v: string) => {
    const parts = v.split(':').map(Number);
    const sec = parts.reduce((acc, p) => acc * 60 + p, 0);
    return `${attr}="${(sec * k).toFixed(3)}"`;
  });
}

/** Better Lyrics API: бесплатный, отдаёт TTML с синхронизацией по слогам. */
async function betterLyrics(track: Track): Promise<string | null> {
  const tempo = isTempoVersion(track.title);
  const params = new URLSearchParams({ s: cleanTitle(track.title) || track.title, a: track.artists.map((a) => a.name).join(', ') });
  if (track.album?.name && !tempo) params.set('al', track.album.name);
  if (track.durationSec && !tempo) params.set('d', String(Math.round(track.durationSec)));
  try {
    const r = await xfetch(`https://api.betterlyrics.org/getLyrics?${params}`, { headers: { 'User-Agent': `Player/${app.getVersion()} (desktop music player)` }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const ttml = j?.ttml ?? j?.data?.ttml ?? j?.lyrics?.ttml;
    return typeof ttml === 'string' && ttml.includes('<tt') ? ttml : null;
  } catch {
    return null;
  }
}

const ttmlSync = (x: string): Lyrics['sync'] => (/itunes:timing="Word"|<span[^>]+begin=/.test(x) ? 'syllable' : 'line');
const lrcSync = (x: string): Lyrics['sync'] => (/<\d{1,2}:\d{2}/.test(x) ? 'word' : 'line');

// --- Проверка, что найденный текст — от этой самой песни -----------------------------
const plainWords = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1);

/** Доля слов текста a, которые встречаются в тексте b (0..1). */
function overlap(a: string, b: string): number {
  const A = new Set(plainWords(a));
  const B = new Set(plainWords(b));
  if (A.size < 5 || B.size < 5) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / A.size;
}

const squash = (s: string) => plainWords(s).join('');
const titleMatches = (a: string, b: string) => {
  const x = squash(cleanTitle(a));
  const y = squash(cleanTitle(b));
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x) || similar(cleanTitle(a), cleanTitle(b)) >= 0.6);
};
const artistMatches = (name: string, track: Track) =>
  track.artists.some((a) => {
    const x = squash(a.name);
    const y = squash(name);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x) || similar(a.name, name) >= 0.5);
  });

const lastLrcTime = (lrc: string) => parseLrc(lrc).at(-1)?.t ?? 0;
const lastTtmlEnd = (x: string) => Math.max(0, ...[...x.matchAll(/end="([\d:.]+)s?"/g)].map((m) => m[1].split(':').map(Number).reduce((a, p) => a * 60 + p, 0)));

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export async function lyrics(track: Track): Promise<Lyrics> {
  const hit = cache.get(track.id);
  if (hit) return hit;
  const [ttmlRaw, lrcs, ytPlain] = await Promise.all([
    settleWithin(betterLyrics(track), 4500, null),
    settleWithin(lrclibCandidates(track), 5000, []),
    settleWithin(ytLyrics(track.id), 3000, null)
  ]);
  const tempo = isTempoVersion(track.title);
  const d = track.durationSec ?? 0;
  // Для Speed Up / Slowed: коэффициент — длительность трека к длительности оригинала
  const ratio = (orig?: number, name?: string) => {
    if (!tempo || !orig || !d || (name && isTempoVersion(name))) return 1;
    return Math.abs(d - orig) < 3 ? 1 : d / orig;
  };

  // 1. LRCLIB: оставляем только то, что точно от этой песни
  const lrcVariants: Lyrics[] = [];
  for (const i of lrcs) {
    const text = i.syncedLyrics ?? i.plainLyrics ?? '';
    const byText = ytPlain ? overlap(text, ytPlain) : -1;
    // Текст YouTube Music — от самого трека: если он есть, найденный текст обязан с ним совпадать
    if (ytPlain && byText < 0.4) continue;
    if (!titleMatches(i.trackName, track.title) && byText < 0.6) continue;
    if (!artistMatches(i.artistName, track) && byText < 0.5) continue;
    const k = ratio(i.duration, i.trackName);
    // Другая версия (клип с интро, лайв, ремикс) — тайминги разъедутся
    if (!tempo && d && i.duration && Math.abs(i.duration - d) > 4) {
      if (!i.plainLyrics) continue;
      i.syncedLyrics = null;
    }
    let lrc = i.syncedLyrics ? (k !== 1 ? scaleLrc(i.syncedLyrics, k) : i.syncedLyrics) : undefined;
    if (lrc && d && lastLrcTime(lrc) > d + 5) continue;
    // Неполный синхронный текст (обрывается на первом куплете) — песня ещё поётся, а строки кончились.
    // Сравниваем с полным текстом: если в синхронном заметно меньше слов — он неполный.
    const fullText = ytPlain ?? i.plainLyrics ?? '';
    const partial = !!lrc && !!((d > 60 && lastLrcTime(lrc) < d * 0.6) || (fullText && plainWords(lrc).length < plainWords(fullText).length * 0.7));
    if (partial) console.warn(`[lyrics] неполный синхронный текст (до ${Math.round(lastLrcTime(lrc!))} с из ${d}): ${i.artistName} — ${i.trackName}`);
    lrcVariants.push({
      synced: lrc ? parseLrc(lrc) : null,
      plain: i.plainLyrics,
      lrc,
      source: 'lrclib',
      sync: lrc ? lrcSync(lrc) : 'none',
      match: Math.min(1, matchScore({ title: i.trackName, artist: i.artistName, durationSec: i.duration }, track) + Math.max(0, byText) * 0.3) * (partial ? 0.5 : 1),
      partial,
      label: `LRCLIB${lrc ? '' : ' · без синхр.'}${partial ? ' · неполный' : ''}${k !== 1 ? ` · подогнано ×${(1 / k).toFixed(2)}` : ''} · ${fmt(i.duration)}`
    });
  }
  // Сначала полные синхронные, потом неполные, потом без синхронизации
  const rank = (v: Lyrics) => (v.sync !== 'none' && !v.partial ? 2 : v.sync !== 'none' ? 1 : 0);
  lrcVariants.sort((a, b) => rank(b) - rank(a) || (b.match ?? 0) - (a.match ?? 0));

  // 2. Better Lyrics: название в ответе не приходит — сверяем по самому тексту и длительности
  const variants: Lyrics[] = [];
  if (ttmlRaw) {
    const origItem = lrcs.find((i) => i.duration && !isTempoVersion(i.trackName) && titleMatches(i.trackName, track.title));
    const k = ratio(origItem?.duration);
    const ttml = k !== 1 ? scaleTtml(ttmlRaw, k) : ttmlRaw;
    const end = lastTtmlEnd(ttml);
    const ref = ytPlain ?? lrcVariants[0]?.lrc ?? lrcVariants[0]?.plain ?? null;
    const textOk = ref ? overlap(ttmlRaw, ref) >= 0.4 : true;
    const timeOk = !d || (end <= d + 5 && end >= d * 0.4);
    const full = ytPlain ?? lrcVariants[0]?.plain ?? null;
    const ttmlPartial = (d > 60 && end < d * 0.6) || (!!full && plainWords(ttmlRaw).length < plainWords(full).length * 0.7);
    if (textOk && timeOk)
      variants.push({ synced: null, plain: null, source: 'betterlyrics', label: `Better Lyrics${ttmlPartial ? ' · неполный' : ''}${k !== 1 ? ` · подогнано ×${(1 / k).toFixed(2)}` : ''}`, ttml, sync: ttmlSync(ttml), match: ttmlPartial ? 0.5 : 1, partial: ttmlPartial });
  }
  variants.push(...lrcVariants);
  {
    const rank = (v: Lyrics) => (v.sync !== 'none' && !v.partial ? 2 : v.sync !== 'none' ? 1 : 0);
    variants.sort((a, b) => rank(b) - rank(a) || Number(b.source === 'betterlyrics') - Number(a.source === 'betterlyrics') || (b.match ?? 0) - (a.match ?? 0));
  }
  // Если все синхронные неполные, а есть полный текст YouTube — он важнее: лучше весь текст без подсветки
  if (ytPlain && variants.length && variants.every((v) => v.sync === 'none' || v.partial)) {
    variants.unshift({ synced: null, plain: ytPlain, source: 'youtube', label: 'YouTube Music · полный текст', sync: 'none', match: 1 });
  } else if (ytPlain) variants.push({ synced: null, plain: ytPlain, source: 'youtube', label: 'YouTube Music', sync: 'none', match: 1 });
  if (variants.length === 0) console.warn(`[lyrics] не нашёл подходящий текст: ${track.artists[0]?.name} — ${track.title}`);
  const result: Lyrics = variants[0] ? { ...variants[0], alternatives: variants } : { synced: null, plain: null, source: null };
  cache.set(track.id, result);
  return result;
}
