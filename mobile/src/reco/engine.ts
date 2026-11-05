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

/* ---------- фильтры ---------- */
export function cleanup(list: Track[], opts: { keepFirst?: boolean } = {}) {
  const t = useTaste.getState();
  const recent = t.reco.noRepeatHours * 3600e3;
  const lastPlayed = new Map<string, number>();
  for (const m of Object.values(t.months)) for (const x of Object.values(m.tracks)) lastPlayed.set(x.track.id, Math.max(lastPlayed.get(x.track.id) || 0, x.last));
  const seen = new Set<string>();
  const out: Track[] = [];
  list.forEach((tr, i) => {
    if (!tr?.id || seen.has(tr.id) || !tr.streamable) return;
    const keep = opts.keepFirst && i === 0;
    if (!keep) {
      if (t.hiddenTracks[tr.id] || t.hiddenArtists[artistKey(tr)]) return;
      if (recent && Date.now() - (lastPlayed.get(tr.id) || 0) < recent) return;
      const sk = Object.values(t.months).reduce((n, m) => n + (m.tracks[tr.id]?.skips || 0), 0);
      if (t.reco.useSkips && sk >= 2) return;
    }
    seen.add(tr.id); out.push(tr);
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

/* Доля знакомого по ползунку «Знакомое — Новое» */
const familiarShare = () => [0.95, 0.75, 0.5, 0.25, 0.05][useTaste.getState().reco.balance];

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
  const r = rng(seed);
  const lib = useLibrary.getState();
  const scored = artistScores();
  if (!scored.length) {
    const home = await lull.home(undefined, s);
    return cleanup(mix(home.flatMap((x) => x.items).filter((c) => c.track).map((c) => c.track!), r));
  }
  /* каждый раз — разные исполнители из первой десятки и разные их треки */
  const top = [...scored.slice(0, 3), ...pick(scored.slice(3, 14), 4, r)];
  const known = knownArtists();
  const [tops, sims, radio, night] = await Promise.all([
    Promise.all(top.map((a) => topOf(a, s).then((l) => pick(l.slice(0, 12), 4, r)))),
    useTaste.getState().reco.similarArtists ? Promise.all(pick(top, 3, r).map((a) => similarOf(a, s))) : Promise.resolve([] as Artist[][]),
    (() => {
      const seeds = pick([...lib.liked.slice(0, 30), ...lib.history.slice(0, 20).map((h) => h.track)].filter((t) => t.source === 'yt'), 3, r);
      return Promise.all(seeds.map((t) => safe(lull.upNext(t.id, s), [] as Track[])));
    })(),
    chipTracks(dayChip(), s),
  ]);
  const newArtists = pick(sims.flat().filter((a) => !known.has(a.id)), 6, r);
  const fresh = await Promise.all(newArtists.map((a) => topOf(a, s).then((l) => pick(l.slice(0, 6), 3, r))));
  const familiar: Track[] = [];
  for (let i = 0; i < 4; i++) for (const l of tops) if (l[i]) familiar.push(l[i]);
  const liked = pick(lib.liked, 15, r);
  const discovery = mix([...fresh.flat(), ...radio.flat().filter((t) => !known.has(artistKey(t)))], r);
  const f = familiarShare();
  return cleanup(blend([
    { list: familiar, w: f * 0.7 },
    { list: liked, w: f * 0.3 },
    { list: discovery, w: (1 - f) * 0.8 },
    { list: mix(night, r), w: (1 - f) * 0.2 + 0.05 },
  ], 60));
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

export async function buildWave(seed: Track, mode: WaveMode, length: number, s: AbortSignal): Promise<Track[]> {
  const lib = useLibrary.getState();
  const yt = seed.source === 'yt';
  const seedArtist = { id: seed.artistId, source: seed.source };
  const known = knownArtists();
  const [radio, own, sims, album, calm, energy] = await Promise.all([
    yt ? safe(lull.upNext(seed.id, s), [] as Track[]) : Promise.resolve([] as Track[]),
    seed.artistId ? topOf(seedArtist, s) : Promise.resolve([] as Track[]),
    seed.artistId ? similarOf(seedArtist, s) : Promise.resolve([] as Artist[]),
    yt && seed.albumId && (mode === 'artist') ? safe(lull.collection('album', seed.albumId, s).then((c) => c.tracks), [] as Track[]) : Promise.resolve([] as Track[]),
    mode === 'calm' ? chipTracks('Релакс', s) : Promise.resolve([] as Track[]),
    mode === 'energy' ? chipTracks('Вечеринка', s) : Promise.resolve([] as Track[]),
  ]);
  const simPick = mode === 'discover' ? sims.filter((a) => !known.has(a.id)) : sims;
  const simTracks = (await Promise.all(simPick.slice(0, mode === 'discover' ? 8 : 4).map((a) => topOf(a, s).then((l) => l.slice(0, mode === 'discover' ? 4 : 3))))).flat();
  /* второй круг радио — от первых треков волны, чтобы она не замыкалась на одном звучании */
  const radio2 = yt && (mode === 'sound' || mode === 'discover' || length > 50)
    ? (await Promise.all(radio.slice(1, 3).map((t) => safe(lull.upNext(t.id, s), [] as Track[])))).flat() : [];
  const simKeys = new Set([artistKey(seed), ...sims.map((a) => a.id)]);
  const likedNear = lib.liked.filter((t) => simKeys.has(artistKey(t)));
  const likedAll = lib.liked;
  const notKnown = (l: Track[]) => l.filter((t) => !known.has(artistKey(t)));

  const plan: Record<WaveMode, { list: Track[]; w: number }[]> = {
    sound: [{ list: radio, w: 5 }, { list: radio2, w: 2 }, { list: simTracks, w: 2 }, { list: own, w: 1 }, { list: likedNear, w: 1 }],
    artist: [{ list: own, w: 5 }, { list: album, w: 3 }, { list: radio.filter((t) => artistKey(t) === artistKey(seed)), w: 2 }, { list: radio, w: 1 }],
    discover: [{ list: simTracks, w: 4 }, { list: notKnown(radio), w: 3 }, { list: notKnown(radio2), w: 2 }],
    favorite: [{ list: likedNear, w: 4 }, { list: likedAll, w: 2 }, { list: radio.filter((t) => known.has(artistKey(t))), w: 2 }, { list: own, w: 1 }],
    calm: [{ list: radio, w: 3 }, { list: calm, w: 3 }, { list: simTracks, w: 1 }],
    energy: [{ list: radio, w: 3 }, { list: energy, w: 3 }, { list: simTracks, w: 1 }],
  };
  const f = familiarShare();
  const parts = plan[mode].map((p) => ({ ...p, w: p.list === likedAll || p.list === likedNear || p.list === own ? p.w * (0.5 + f) : p.w * (1.5 - f) }));
  return cleanup([seed, ...blend(parts, length * 2)], { keepFirst: true }).slice(0, length);
}
