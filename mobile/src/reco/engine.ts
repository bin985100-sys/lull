/* Рекомендации Lull.
   Сигналы вкуса: время прослушивания за этот и прошлый месяц, засчитанные прослушивания, лайки,
   выбранные при входе и добавленные в коллекцию исполнители, пропуски в первые 30 секунд, скрытые треки и исполнители.
   Источники треков: «радио» каталога по звучанию трека, популярное исполнителя, альбом, похожие исполнители,
   любимые треки, настроения каталога по времени суток. Фильтры: скрытое, недавно слушанное, не больше N треков
   одного исполнителя подряд, баланс знакомого и нового. */
import { audius, type Artist, type Track } from '@/api/audius';
import { lull } from '@/api/lull';
import { useLibrary } from '@/store/library';
import { artistKey, monthKey, prevMonthKey, useTaste, type WaveMode } from '@/store/taste';
import { recordingKey, selectRecommendations, type Candidate, type SelectionPolicy } from './selection';

const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);

/* Случайность с зерном: «Для тебя» меняется каждые 4 часа и по кнопке «Обновить», но не скачет при каждом открытии экрана */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const seedNow = (extra = 0) => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + Math.floor(d.getHours() / 4) * 7919 + extra * 104729; };
function mix<T>(list: T[], r: () => number) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pick = <T,>(list: T[], n: number, r: () => number) => mix(list, r).slice(0, n);

/* ---------- профиль вкуса ---------- */
export function artistScores() {
  const t = useTaste.getState();
  const lib = useLibrary.getState();
  const score = new Map<string, { key: string; id: string; name: string; source?: string; score: number }>();
  const add = (key: string, id: string, name: string, source: string | undefined, v: number) => {
    const cur = score.get(key) ?? { key, id, name, source, score: 0 };
    cur.score += v; if (!cur.id && id) cur.id = id;
    score.set(key, cur);
  };
  for (const [mk, w] of [[monthKey(), 1], [prevMonthKey(), 0.5]] as const) {
    const m = t.months[mk];
    if (!m) continue;
    for (const a of Object.values(m.artists)) add(a.key, a.id, a.name, a.source, w * (Math.log2(1 + a.secs / 60) * 2 + a.plays * 0.5));
  }
  lib.liked.forEach((tr) => add(artistKey(tr), tr.artistId, tr.artist.split(',')[0], tr.source, 2));
  lib.favArtists.forEach((a) => add(a.id, a.id, a.name, a.source, 4));
  for (const [k, n] of Object.entries(t.artistSkips)) { const c = score.get(k); if (c) c.score -= n * 0.7; }
  for (const k of Object.keys(t.hiddenArtists)) score.delete(k);
  return [...score.values()].filter((x) => x.score > 0 && x.id).sort((a, b) => b.score - a.score);
}

const knownArtists = () => new Set(artistScores().map((a) => a.key));

function policy(mode: WaveMode, length: number, personal: boolean, seed: number, exclude: Track[] = []): SelectionPolicy {
  const taste = useTaste.getState(), lastPlayed = new Map<string, number>(), skips = new Map<string, number>();
  for (const month of Object.values(taste.months)) for (const stat of Object.values(month.tracks)) {
    const key = recordingKey(stat.track);
    lastPlayed.set(key, Math.max(lastPlayed.get(key) || 0, stat.last));
    skips.set(key, (skips.get(key) || 0) + (stat.skips || 0));
  }
  return { ...taste.reco, mode, length, personal, knownArtists: knownArtists(), random: rng(seed), now: Date.now(),
    liked: new Set(useLibrary.getState().liked.map(recordingKey)), hiddenTracks: new Set(Object.keys(taste.hiddenTracks)),
    hiddenArtists: new Set(Object.keys(taste.hiddenArtists)), skipped: new Set([...skips].filter(([, n]) => n >= 2).map(([key]) => key)),
    lastPlayed, exclude: new Set(exclude.map(recordingKey)) };
}
const candidates = (tracks: Track[], source: Candidate['source']): Candidate[] => tracks.map(track => ({ track, source }));

/** A stable cache identity changes on explicit taste edits, not each second of playback. */
export function recommendationKey() {
  const taste = useTaste.getState(), lib = useLibrary.getState();
  const text = JSON.stringify([taste.reco, Object.keys(taste.hiddenTracks), Object.keys(taste.hiddenArtists),
    lib.liked.map(recordingKey), lib.favArtists.map(a => a.id), [...new Set(lib.history.slice(0, 30).map(h => artistKey(h.track)))].sort()]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

/* ---------- фильтры ---------- */
export function cleanup(list: Track[], opts: { keepFirst?: boolean; allowRecent?: boolean } = {}) {
  const t = useTaste.getState();
  const recent = t.reco.noRepeatHours * 3600e3;
  const lastPlayed = new Map<string, number>();
  const identity = (tr: Track) => `${tr.source || 'audius'}:${tr.id}`;
  for (const m of Object.values(t.months)) for (const x of Object.values(m.tracks)) lastPlayed.set(identity(x.track), Math.max(lastPlayed.get(identity(x.track)) || 0, x.last));
  const seen = new Set<string>();
  const out: Track[] = [];
  list.forEach((tr, i) => {
    if (!tr?.id || seen.has(identity(tr)) || !tr.streamable) return;
    const keep = opts.keepFirst && i === 0;
    if (!keep) {
      if (t.hiddenTracks[tr.id] || t.hiddenArtists[artistKey(tr)]) return;
      if (!opts.allowRecent && recent && Date.now() - (lastPlayed.get(identity(tr)) || 0) < recent) return;
      const sk = Object.values(t.months).reduce((n, m) => n + (m.tracks[tr.id]?.skips || 0), 0);
      if (t.reco.useSkips && sk >= 2) return;
    }
    seen.add(identity(tr)); out.push(tr);
  });
  return spread(out, t.reco.perArtist);
}

/* Не больше N треков одного исполнителя подряд: раскладываем, сохраняя порядок важности */
function spread(list: Track[], per: number) {
  const out: Track[] = [];
  const rest = list.slice();
  while (rest.length) {
    const tail = out.slice(-per).map(artistKey);
    const i = rest.findIndex((x) => tail.filter((k) => k === artistKey(x)).length < per);
    out.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/* Смешиваем источники по долям: по очереди берём из каждого, пока не наберём нужное */
function blend(parts: { list: Track[]; w: number }[], n: number) {
  const out: Track[] = [];
  const pos = parts.map(() => 0);
  const acc = parts.map(() => 0);
  const total = parts.reduce((s, p) => s + (p.list.length ? p.w : 0), 0) || 1;
  while (out.length < n && parts.some((p, i) => pos[i] < p.list.length)) {
    parts.forEach((p, i) => { if (pos[i] < p.list.length) acc[i] += p.w / total; });
    let best = -1;
    parts.forEach((p, i) => { if (pos[i] < p.list.length && (best < 0 || acc[i] > acc[best])) best = i; });
    if (best < 0) break;
    acc[best] -= 1;
    out.push(parts[best].list[pos[best]++]);
  }
  return out;
}

const topOf = (a: { id: string; source?: string }, s: AbortSignal) =>
  safe(a.source === 'audius' ? audius.artistTracks(a.id, s) : lull.artist(a.id, s).then((p) => p.top), [] as Track[]);
const similarOf = (a: { id: string; source?: string }, s: AbortSignal) =>
  safe<Artist[]>(a.source === 'audius' ? audius.related(a.id, s) : lull.artist(a.id, s).then((p) => p.similar), []);

function dayChip() {
  if (!useTaste.getState().reco.timeOfDay) return null;
  const h = new Date().getHours();
  return h >= 23 || h < 6 ? 'Релакс' : h < 11 ? 'В дороге' : h < 18 ? 'Концентрация' : null;
}
const chipTracks = async (chip: string | null, s: AbortSignal) => {
  if (!chip) return [] as Track[];
  const secs = await safe(lull.home(chip, s), []);
  return secs.flatMap((x) => x.items).filter((c) => c.track).map((c) => c.track!);
};

/* ---------- «Для тебя» ---------- */
export async function forYou(s: AbortSignal, seed = seedNow()): Promise<Track[]> {
  return buildMyWave(s, { seed, length: 60, mode: 'sound' });
}

/** Continue the listener's taste, rather than labeling an anonymous home feed as personal. */
export async function recommended(s: AbortSignal): Promise<Track[]> {
  return buildMyWave(s, { seed: seedNow(7), length: 40, mode: 'sound' });
}

/** Rotate between distinct taste anchors. One latest play cannot monopolize the pool. */
export async function buildMyWave(signal: AbortSignal, opts: { seed?: number; length?: number; mode?: WaveMode; exclude?: Track[] } = {}): Promise<Track[]> {
  const seed = opts.seed ?? seedNow(), length = opts.length ?? 50, mode = opts.mode ?? useTaste.getState().reco.waveMode;
  const r = rng(seed), lib = useLibrary.getState(), taste = useTaste.getState(), excluded = opts.exclude ?? [];
  const eligible = (track: Track) => !taste.hiddenTracks[track.id] && !taste.hiddenArtists[artistKey(track)];
  const scored = artistScores(), top = pick(scored.slice(0, 12), 3, r);
  const history = Object.values(taste.months).flatMap(month => Object.values(month.tracks)).sort((a,b) => b.secs - a.secs).map(stat => stat.track);
  const anchors = [...new Map(mix([...lib.liked, ...history, ...lib.history.slice(0, 30).map(h => h.track)], r)
    .filter(t => t.source === 'yt' && eligible(t)).map(t => [artistKey(t), t])).values()].slice(0, 3);
  const [radios, pages, mood, popular] = await Promise.all([
    Promise.all(anchors.map(t => waveResource(s => lull.upNext(t.id, s), [] as Track[], signal))),
    Promise.all(top.map(a => waveResource(s => a.source === 'audius' ? Promise.all([topOf(a,s), similarOf(a,s)]).then(([own,similar])=>({top:own,similar})) : lull.artist(a.id,s), null, signal))),
    waveResource(s => chipTracks(mode === 'calm' ? 'Релакс' : mode === 'energy' ? 'Вечеринка' : dayChip(), s), [] as Track[], signal),
    anchors.length ? [] : waveResource(s => lull.charts(s).then(sections => sections.filter(x => x.layout === 'tracks').flatMap(x => x.items).flatMap(c => c.track ? [c.track] : [])), [] as Track[], signal),
  ]);
  const related = taste.reco.similarArtists ? pick([...new Map(pages.flatMap(p => p?.similar ?? []).filter(a => !knownArtists().has(a.id)).map(a => [a.id,a])).values()], 3, r) : [];
  const fresh = await Promise.all(related.map(a => waveResource(s => topOf(a,s), [] as Track[], signal)));
  if (signal.aborted) throw Object.assign(new Error('Wave cancelled'), { name: 'AbortError' });
  const pool = [...candidates(lib.liked, 'favorite'), ...candidates(pages.flatMap(p => p?.top ?? []), 'artist'),
    ...candidates(radios.flat(), 'radio'), ...candidates(fresh.flat(), 'discovery'), ...candidates(mood, 'mood'), ...candidates(popular, 'charts')];
  const p = policy(mode, length, true, seed, excluded), result = selectRecommendations(pool, p);
  // Small catalogs may relax recency; hidden/skipped/queued items never return.
  return result.length >= Math.min(8, length) ? result : selectRecommendations(pool, { ...p, random: rng(seed), allowRecent: true });
}

/* Микс исполнителя: его хиты вперемешку с похожими исполнителями */
export async function artistMix(id: string, s: AbortSignal, seed = seedNow()): Promise<Track[]> {
  const r = rng(seed + id.length * 31);
  const a = { id, source: 'yt' as const };
  const [own, sims] = await Promise.all([topOf(a, s), similarOf(a, s)]);
  const simTracks = (await Promise.all(pick(sims, 5, r).map((x) => topOf(x, s).then((l) => pick(l.slice(0, 8), 3, r))))).flat();
  return cleanup(blend([{ list: pick(own, 12, r), w: 0.45 }, { list: mix(simTracks, r), w: 0.55 }], 40));
}

/* ---------- Волна по треку ---------- */
export const WAVE_MODES: { id: WaveMode; title: string; text: string }[] = [
  { id: 'sound', title: 'Похожее звучание', text: 'Треки, которые звучат как этот' },
  { id: 'artist', title: 'Этот исполнитель', text: 'Его хиты, альбом и коллаборации' },
  { id: 'discover', title: 'Открытия', text: 'Похожие исполнители, которых ты ещё не слушал' },
  { id: 'favorite', title: 'Любимое', text: 'Твои треки в том же духе' },
  { id: 'calm', title: 'Спокойнее', text: 'Тише и мягче, чем исходный трек' },
  { id: 'energy', title: 'Бодрее', text: 'Больше драйва вокруг этого звучания' },
];

// A failed optional endpoint must not hold every cover in the wave indefinitely.
function waveResource<T>(load: (signal: AbortSignal) => Promise<T>, fallback: T, parent: AbortSignal): Promise<T> {
  if (parent.aborted) return Promise.resolve(fallback);
  return new Promise(resolve => {
    const ac = new AbortController();
    const finish = (value: T) => { clearTimeout(timer); parent.removeEventListener('abort', abort); resolve(value); };
    const abort = () => { ac.abort(); finish(fallback); };
    const timer = setTimeout(abort, 3200);
    parent.addEventListener('abort', abort, { once: true });
    void load(ac.signal).then(finish, () => finish(fallback));
  });
}

export async function buildWave(seed: Track, mode: WaveMode, length: number, signal: AbortSignal, exclude: Track[] = []): Promise<Track[]> {
  const ac = new AbortController(), abort = () => ac.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) ac.abort();
  const timer = setTimeout(abort, 9000);
  try {
    const tracks = await assembleWave(seed, mode, length, ac.signal, exclude);
    if (signal.aborted) throw Object.assign(new Error('Wave cancelled'), { name: 'AbortError' });
    return tracks;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

async function assembleWave(seed: Track, mode: WaveMode, length: number, s: AbortSignal, exclude: Track[]): Promise<Track[]> {
  const lib = useLibrary.getState();
  const yt = seed.source === 'yt';
  const seedArtist = { id: seed.artistId, source: seed.source };
  const known = knownArtists();
  const radio = yt ? await waveResource(signal => lull.upNext(seed.id, signal), [] as Track[], s) : [];
  const clean = (pool: Candidate[]) => {
    const p = policy(mode, length - 1, false, seedNow(seed.id.length), [seed, ...exclude]);
    const strict = selectRecommendations(pool, p);
    // Recent listening is a preference, not a reason to show an empty wave.
    // Hidden tracks/artists and skip feedback still apply in the fallback.
    return [seed, ...(strict.length ? strict : selectRecommendations(pool, { ...p, allowRecent: true }))];
  };
  const radioPool = candidates(radio, 'radio');
  const nearby = new Set([artistKey(seed), ...radio.map(artistKey)]);
  if (mode === 'sound') {
    const primary = clean([...radioPool, ...candidates(lib.liked.filter(t => nearby.has(artistKey(t))), 'favorite')]);
    if (primary.length >= Math.min(length, 8)) return primary;
  }
  const artistPage = yt && seed.artistId ? waveResource(signal => lull.artist(seed.artistId, signal), null, s) : Promise.resolve(null);
  const [own, sims, album, calm, energy] = await Promise.all([
    yt ? artistPage.then(p => p?.top || []) : seed.artistId ? waveResource(signal => topOf(seedArtist, signal), [] as Track[], s) : [],
    mode === 'artist' || !useTaste.getState().reco.similarArtists ? [] : yt ? artistPage.then(p => p?.similar || []) : seed.artistId ? waveResource(signal => similarOf(seedArtist, signal), [] as Artist[], s) : [],
    yt && seed.albumId && mode === 'artist' ? waveResource(signal => lull.collection('album', seed.albumId!, signal).then(c => c.tracks), [] as Track[], s) : [],
    mode === 'calm' ? waveResource(signal => chipTracks('Релакс', signal), [] as Track[], s) : [],
    mode === 'energy' ? waveResource(signal => chipTracks('Вечеринка', signal), [] as Track[], s) : [],
  ]);
  const simPick = mode === 'discover' ? sims.filter((a) => !known.has(a.id)) : sims;
  const simTracks = (await Promise.all(simPick.slice(0, mode === 'discover' ? 6 : 3).map((a) => waveResource(signal => topOf(a, signal), [] as Track[], s).then(l => l.slice(0, mode === 'discover' ? 4 : 3))))).flat();
  /* второй круг радио — от первых треков волны, чтобы она не замыкалась на одном звучании */
  const radio2 = yt && (mode === 'sound' || mode === 'discover' || length > 50)
    ? (await Promise.all(radio.slice(1, 3).map(t => waveResource(signal => lull.upNext(t.id, signal), [] as Track[], s)))).flat() : [];
  sims.forEach(a => nearby.add(a.id));
  return clean([...radioPool, ...candidates(radio2, 'radio'), ...candidates(simTracks, 'discovery'),
    ...candidates([...own, ...album], 'artist'), ...candidates(mode === 'favorite' ? lib.liked : lib.liked.filter(t => nearby.has(artistKey(t))), 'favorite'), ...candidates([...calm, ...energy], 'mood')]);
}
