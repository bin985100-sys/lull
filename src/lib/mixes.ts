import type { Track } from '../../shared/types';
import { api } from '../api';
import { useLibrary } from '../store/library';

/**
 * «Ваши миксы»: до 4 подборок по любимым исполнителям. Каждый микс — исполнитель,
 * которого ты слушаешь чаще всего, плюс похожие (рекомендации YouTube Music «Далее»).
 * Состав пересобирается раз в день — как Daily Mix.
 */
export interface Mix {
  n: number;
  title: string;
  /** Исполнители, которые попадут в микс (для подписи) */
  artists: string[];
  seed: Track;
  cover?: string;
}

const dayKey = () => new Date().toISOString().slice(0, 10);

/** Главные исполнители по истории и статистике прослушиваний. */
export function buildMixes(fallback: Track[] = []): Mix[] {
  const { history, stats, likes } = useLibrary.getState();
  const weight = new Map<string, { name: string; score: number; seed: Track }>();
  const add = (t: Track, w: number) => {
    const a = t.artists[0];
    if (!a) return;
    const k = a.id ?? a.name;
    const cur = weight.get(k);
    if (cur) cur.score += w;
    else weight.set(k, { name: a.name, score: w, seed: t });
  };
  for (const m of Object.values(stats)) for (const p of Object.values(m.plays)) add(p.track, p.count * 2 + p.sec / 120);
  history.slice(0, 80).forEach((h, i) => add(h.track, 1.5 - i / 80));
  likes.slice(0, 60).forEach((l) => add(l.track, 1));
  let top = [...weight.values()].sort((a, b) => b.score - a.score).slice(0, 4);
  // Пока истории мало — миксы по популярному, чтобы раздел не пустовал
  if (top.length < 4) {
    for (const t of fallback) {
      if (top.length >= 4) break;
      if (!top.some((x) => x.name === t.artists[0]?.name)) top = [...top, { name: t.artists[0]?.name ?? t.title, score: 0, seed: t }];
    }
  }
  return top.map((a, i) => ({ n: i + 1, title: `Микс ${i + 1}`, artists: [a.name], seed: a.seed, cover: a.seed.thumb }));
}

const cache = new Map<string, Track[]>();

/** Треки микса: сам исполнитель + похожие; для одного дня — один и тот же состав. */
export async function mixTracks(mix: Mix): Promise<Track[]> {
  const key = `${dayKey()}:${mix.seed.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const next = await api.upNext(mix.seed.id).catch(() => [] as Track[]);
  const list = [mix.seed, ...next.filter((t) => t.id !== mix.seed.id)].slice(0, 50);
  cache.set(key, list);
  return list;
}

/** Подпись под карточкой: главный исполнитель и пара соседей по миксу. */
export function mixSubtitle(mix: Mix, tracks?: Track[]): string {
  const names = new Set(mix.artists);
  for (const t of tracks ?? []) {
    if (names.size >= 3) break;
    if (t.artists[0]) names.add(t.artists[0].name);
  }
  return [...names].join(', ');
}

/** Последние посчитанные миксы — чтобы страница микса открывалась по ссылке /mix/:n. */
let last: Mix[] = [];
export const rememberMixes = (m: Mix[]) => (last = m);
export const getMix = (n: number, fallback: Track[] = []) => (last.length ? last : (last = buildMixes(fallback))).find((m) => m.n === n);
