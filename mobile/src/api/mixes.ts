import { artistMix, forYou, seedNow } from '@/reco/engine';
import { create } from 'zustand';
import { audius, FOCUS_IMAGE, type Track } from './audius';
import { lull } from './lull';

/* Подборки приложения: чарты и рекомендации каталога Lull, микс из любимых исполнителей, находки Audius. */
export type Mix = { id: string; title: string; image?: any; load: (s: AbortSignal) => Promise<Track[]> };

const tracksOf = (secs: Awaited<ReturnType<typeof lull.home>>) => secs.flatMap((x) => x.items).filter((c) => c.track).map((c) => c.track!);

/* «Обновить» у «Для тебя»: новое зерно — новый набор */
export const useMixSeed = create<{ n: number }>(() => ({ n: 0 }));

export const MIXES: Record<string, Mix> = {
  foryou: { id: 'foryou', title: 'Для тебя', image: FOCUS_IMAGE, load: forYou },
  recommended: { id: 'recommended', title: 'Дальше по звучанию', load: async (s) => tracksOf(await lull.home(undefined, s)) },
  trending: { id: 'trending', title: 'В тренде', load: async (s) => tracksOf((await lull.charts(s)).filter((x) => x.layout === 'tracks')) },
  underground: { id: 'underground', title: 'Независимые артисты', load: (s) => audius.underground(s) },
};

/* Подборка по id: постоянные из MIXES и миксы исполнителей «artist:<id>» */
export function getMix(id: string, name?: string): Mix {
  if (id.startsWith('artist:')) {
    const aid = id.slice(7);
    const seed = seedNow();
    return { id: `${id}:${seed}`, title: name ? `Микс: ${name}` : 'Микс исполнителя', load: (s) => artistMix(aid, s, seed) };
  }
  if (id === 'foryou') { const seed = seedNow(useMixSeed.getState().n); return { ...MIXES.foryou, id: `foryou:${seed}`, load: (s) => forYou(s, seed) }; }
  return MIXES[id] ?? MIXES.trending;
}
