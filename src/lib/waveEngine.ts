import type { Track } from '../../shared/types';
import { api } from '../api';
import { useLibrary } from '../store/library';

/**
 * Движок «Волны».
 *
 * 1. Профиль вкуса: веса исполнителей по статистике (свежие месяцы важнее), истории
 *    (свежие прослушивания важнее), лайкам; пропуски снижают вес, дослушивания — повышают.
 * 2. Кандидаты: радио YouTube Music от нескольких «семян» (любимые и недавние треки),
 *    подборки выбранного настроения, чарты.
 * 3. Оценка: близость к вкусу, новизна, настроение, популярность, штрафы за пропуски
 *    и недавно игравшее; немного случайности, чтобы волна не повторялась.
 * 4. Разнообразие: не больше двух треков одного исполнителя в порции и не подряд.
 */

export interface ArtistWeight {
  key: string;
  id?: string;
  name: string;
  thumb?: string;
  score: number;
  /** Доля во вкусе, 0..1 */
  share: number;
  seeds: Track[];
}

export interface TasteProfile {
  artists: ArtistWeight[];
  known: Set<string>;
  knownArtists: Set<string>;
  recent: Set<string>;
  seeds: Track[];
  empty: boolean;
}

interface Prefs {
  mood: 'any' | 'energy' | 'calm' | 'happy' | 'sad';
  mode: 'mix' | 'favorite' | 'discover' | 'popular';
  disliked: string[];
  skips: Record<string, number>;
  finishes: Record<string, number>;
}

const keyOf = (t: Track) => t.artists[0]?.id ?? t.artists[0]?.name ?? '';

export function buildProfile(prefs: Pick<Prefs, 'skips' | 'finishes'>): TasteProfile {
  const { stats, history, likes } = useLibrary.getState();
  const map = new Map<string, ArtistWeight & { trackScore: Map<string, { t: Track; s: number }> }>();
  const known = new Set<string>();
  const add = (t: Track, w: number) => {
    known.add(t.id);
    const a = t.artists[0];
    if (!a || w <= 0) return;
    const k = keyOf(t);
    let e = map.get(k);
    if (!e) map.set(k, (e = { key: k, id: a.id, name: a.name, thumb: t.thumb, score: 0, share: 0, seeds: [], trackScore: new Map() }));
    e.score += w;
    const ts = e.trackScore.get(t.id);
    if (ts) ts.s += w;
    else e.trackScore.set(t.id, { t, s: w });
  };

  // Статистика: текущий месяц — вес 1, каждый предыдущий — ×0.6
  const months = Object.keys(stats).sort().reverse();
  months.forEach((m, age) => {
    const decay = Math.pow(0.6, age);
    for (const p of Object.values(stats[m].plays)) add(p.track, (p.count * 2 + p.sec / 90) * decay);
  });
  history.slice(0, 120).forEach((h, i) => add(h.track, 2 * Math.exp(-i / 40)));
  likes.slice(0, 200).forEach((l, i) => add(l.track, 3 * Math.exp(-i / 120) + 1));

  for (const e of map.values()) {
    const sk = prefs.skips[e.key] ?? 0;
    const fin = prefs.finishes[e.key] ?? 0;
    e.score = (e.score + fin * 0.6) / (1 + sk * 0.35);
  }
  const list = [...map.values()].sort((a, b) => b.score - a.score);
  const total = list.reduce((s, a) => s + a.score, 0) || 1;
  const artists: ArtistWeight[] = list.map((e) => ({
    key: e.key,
    id: e.id,
    name: e.name,
    thumb: e.thumb,
    score: e.score,
    share: e.score / total,
    seeds: [...e.trackScore.values()].sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.t)
  }));
  const seeds = artists.slice(0, 8).flatMap((a) => a.seeds.slice(0, 1));
  return {
    artists,
    known,
    knownArtists: new Set(artists.map((a) => a.key)),
    recent: new Set(history.slice(0, 40).map((h) => h.track.id)),
    seeds,
    empty: artists.length === 0
  };
}

const MOOD_CHIP: Record<Exclude<Prefs['mood'], 'any'>, RegExp> = {
  energy: /энерг|бодр|трениров|workout|energ/i,
  calm: /расслаб|спок|концентр|сон|relax|chill|focus/i,
  happy: /вечерин|весел|хорош|позитив|party|feel good/i,
  sad: /грус|печал|sad/i
};

/** Взвешенный случайный выбор k элементов. */
function pickWeighted<T>(items: T[], weight: (x: T) => number, k: number): T[] {
  const pool = items.map((x) => ({ x, w: Math.max(0.0001, weight(x)) }));
  const out: T[] = [];
  while (out.length < k && pool.length) {
    let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    const i = pool.findIndex((p) => (r -= p.w) <= 0);
    out.push(pool.splice(i < 0 ? 0 : i, 1)[0].x);
  }
  return out;
}

interface Candidate {
  t: Track;
  reason: string;
  from: 'radio' | 'mood' | 'popular' | 'favorite';
}

export async function buildBatch(profile: TasteProfile, prefs: Prefs, exclude: Set<string>, count: number): Promise<{ tracks: Track[]; reasons: Record<string, string> }> {
  const disliked = new Set(prefs.disliked);
  const jobs: Promise<Candidate[]>[] = [];

  // Радио от «семян»: 2 любимых исполнителя (с учётом веса) + 1 недавний трек
  const recentSeed = useLibrary.getState().history[0]?.track;
  const seedArtists = pickWeighted(profile.artists.slice(0, 12), (a) => a.score, prefs.mode === 'discover' ? 3 : 2);
  const seeds = [...seedArtists.map((a) => a.seeds[Math.floor(Math.random() * a.seeds.length)]), ...(recentSeed ? [recentSeed] : [])].filter(Boolean) as Track[];
  for (const seed of seeds)
    jobs.push(
      api
        .upNext(seed.id)
        .then((list) => list.map((t) => ({ t, reason: `Похоже на «${seed.title}»`, from: 'radio' as const })))
        .catch(() => [])
    );

  // Настроение — подборки YouTube Music из нужной категории
  if (prefs.mood !== 'any') {
    jobs.push(
      api
        .homeChips()
        .then(async (chips) => {
          const chip = chips.find((c) => MOOD_CHIP[prefs.mood as keyof typeof MOOD_CHIP].test(c));
          if (!chip) return [];
          const secs = await api.home(chip);
          return secs.flatMap((s) => s.items.map((c) => c.track).filter(Boolean) as Track[]).map((t) => ({ t, reason: `Настроение: ${chip.toLowerCase()}`, from: 'mood' as const }));
        })
        .catch(() => [])
    );
  }

  // Популярное — если так выбрано или пока не из чего строить вкус
  if (prefs.mode === 'popular' || profile.empty || prefs.mode === 'mix')
    jobs.push(
      api
        .charts()
        .then((secs) => secs.flatMap((s) => s.items.map((c) => c.track).filter(Boolean) as Track[]).map((t) => ({ t, reason: 'Популярно сейчас', from: 'popular' as const })))
        .catch(() => [])
    );

  // Любимое — сами любимые треки тоже возвращаются в волну (кроме недавно игравших)
  if (prefs.mode === 'favorite' || prefs.mode === 'mix')
    for (const a of profile.artists.slice(0, 10)) for (const t of a.seeds) jobs.push(Promise.resolve([{ t, reason: `Ты часто слушаешь ${a.name}`, from: 'favorite' as const }]));

  const all = (await Promise.all(jobs)).flat();
  const byId = new Map<string, Candidate & { score: number }>();
  const maxScore = profile.artists[0]?.score || 1;
  const w = {
    mix: { aff: 0.55, nov: 0.35, pop: 0.15, fav: 0.2 },
    favorite: { aff: 1, nov: -0.2, pop: 0.05, fav: 0.6 },
    discover: { aff: 0.25, nov: 1, pop: 0.1, fav: -1 },
    popular: { aff: 0.25, nov: 0.15, pop: 0.9, fav: -0.2 }
  }[prefs.mode];

  for (const c of all) {
    const t = c.t;
    if (exclude.has(t.id) || disliked.has(t.id) || profile.recent.has(t.id)) continue;
    const k = keyOf(t);
    const artist = profile.artists.find((a) => a.key === k);
    const aff = artist ? artist.score / maxScore : 0;
    const novelty = artist ? 0 : 1;
    let score = w.aff * aff + w.nov * novelty + Math.random() * 0.25;
    if (c.from === 'popular') score += w.pop;
    if (c.from === 'favorite') score += w.fav;
    if (c.from === 'mood') score += 0.6;
    if (c.from === 'radio') score += 0.25;
    if (profile.known.has(t.id) && c.from !== 'favorite') score -= 0.1;
    score -= (prefs.skips[k] ?? 0) * 0.18;
    const reason = artist && aff > 0.35 && c.from !== 'mood' ? `Ты часто слушаешь ${artist.name}` : !artist && c.from === 'radio' ? `Новое для тебя · ${c.reason.toLowerCase()}` : c.reason;
    const prev = byId.get(t.id);
    // Трек, который пришёл из нескольких источников, — сильный кандидат
    if (prev) prev.score = Math.max(prev.score, score) + 0.2;
    else byId.set(t.id, { ...c, reason, score });
  }

  const sorted = [...byId.values()].sort((a, b) => b.score - a.score);
  const out: Track[] = [];
  const reasons: Record<string, string> = {};
  const perArtist = new Map<string, number>();
  for (const c of sorted) {
    if (out.length >= count) break;
    const k = keyOf(c.t);
    const last = out[out.length - 1];
    if (last && keyOf(last) === k) continue;
    if ((perArtist.get(k) ?? 0) >= 2) continue;
    perArtist.set(k, (perArtist.get(k) ?? 0) + 1);
    out.push(c.t);
    reasons[c.t.id] = c.reason;
  }
  return { tracks: out, reasons };
}
